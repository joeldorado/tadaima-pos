<?php

namespace App\Services;

use App\Models\Inventory;
use App\Models\InventoryMovement;
use App\Models\Payment;
use App\Models\PaymentMethod;
use App\Models\Product;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\SalesDraft;
use App\Models\SalesDraftItem;
use App\Models\Terminal;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

class CheckoutService
{
    /**
     * Convierte un SalesDraft en una Sale real.
     *
     * Flujo dentro de una única DB::transaction:
     *  1. Lock + validar draft activo
     *  2. Validar que tiene items
     *  3. Calcular subtotal / total y cotejar con pagos
     *  4. Verificar y reservar stock con lockForUpdate()
     *  5. Crear Sale
     *  6. Crear SaleItems desde DraftItems
     *  7. Crear Payments (con comisión por terminal)
     *  8. Descontar inventario + InventoryMovements
     *  9. Marcar draft como completed
     *
     * @throws \DomainException con mensaje legible para el usuario
     */
    /**
     * Checkout directo (ADR-014, client-authoritative cart): crea draft + items
     * y delega al checkout clásico en una sola transacción. Usado cuando el
     * frontend mantiene el carrito en memoria + localStorage y solo persiste
     * al cobrar. Si el stock no alcanza, todo rollback — no queda draft sucio.
     *
     * @param array<int,array{product_id:int,quantity:float,price:float,price_level?:string}> $items
     */
    public function checkoutDirect(
        int $storeId,
        int $registerSessionId,
        ?int $customerId,
        array $items,
        array $paymentsData,
        float $discount,
        int $userId,
        ?float $cashReceivedUsd = null,
        ?float $exchangeRate = null,
    ): Sale {
        return DB::transaction(function () use ($storeId, $registerSessionId, $customerId, $items, $paymentsData, $discount, $userId, $cashReceivedUsd, $exchangeRate) {
            // Guard de precios (2026-05-30): el carrito vive client-side (ADR-014)
            // y el backend confiaba 100% en el `price` enviado. Validamos que el
            // precio de cada item NO dañado coincida con un nivel del catálogo
            // del producto (base o precio por tienda). Los dañados llevan flag
            // `is_damaged` y permiten precio manual.
            $this->assertPricesMatchCatalog($storeId, $items);

            $draft = SalesDraft::create([
                'store_id'            => $storeId,
                'register_session_id' => $registerSessionId,
                'user_id'             => $userId,
                'customer_id'         => $customerId,
                'status'              => SalesDraft::STATUS_OPEN,
            ]);

            // El observer bumpDraftFromItem gasta 2 queries por item (lazy load
            // del draft + saveQuietly para extender expires_at). Aquí el draft
            // se completa en la misma transacción — no hay tiempo de expirar,
            // así que cualquier bump es desperdicio. Skipear el evento ahorra
            // 2N queries (N = items en el carrito) por checkout.
            SalesDraftItem::withoutEvents(function () use ($items, $draft) {
                foreach ($items as $item) {
                    $row = new SalesDraftItem([
                        'draft_id'   => $draft->id,
                        'product_id' => (int) $item['product_id'],
                        'quantity'   => (float) $item['quantity'],
                        'price'      => (float) $item['price'],
                    ]);
                    // booted() recalcula `total` en `creating`, pero withoutEvents
                    // también skipea creating. Replicamos la fórmula a mano.
                    $row->total      = round($row->quantity * $row->price, 2);
                    $row->created_at = now();
                    $row->save();
                }
            });

            // Delegamos al checkout clásico — toda la lógica de stock, locks,
            // payments, descuento de inventario, ya está probada.
            return $this->checkout(
                draftId:         $draft->id,
                paymentsData:    $paymentsData,
                discount:        $discount,
                userId:          $userId,
                cashReceivedUsd: $cashReceivedUsd,
                exchangeRate:    $exchangeRate,
            );
        });
    }

    public function checkout(
        int $draftId,
        array $paymentsData,
        float $discount,
        int $userId,
        ?float $cashReceivedUsd = null,
        ?float $exchangeRate = null,
    ): Sale {
        return DB::transaction(function () use ($draftId, $paymentsData, $discount, $userId, $cashReceivedUsd, $exchangeRate) {

            // ── 1. Lock draft y validar estado ────────────────────────────────
            $draft = SalesDraft::lockForUpdate()->findOrFail($draftId);

            if (! in_array($draft->status, [SalesDraft::STATUS_OPEN, SalesDraft::STATUS_SUSPENDED])) {
                throw new \DomainException(
                    "El draft #{$draftId} no está activo (estado actual: {$draft->status})."
                );
            }

            // ── 2. Cargar items y validar que no esté vacío ───────────────────
            $draftItems = $draft->items()->with('product.paymentMethod')->get();

            if ($draftItems->isEmpty()) {
                throw new \DomainException('No hay productos en la venta.');
            }

            // ── 2b. Restricciones de pago por producto (solo-efectivo, etc.) ──
            $this->assertPaymentMethodsAllowed($draftItems, $paymentsData);

            // ── 3. Calcular montos ────────────────────────────────────────────
            $subtotal        = round($draftItems->sum('total'), 2);
            $discountAmount  = round($discount, 2);
            $total           = round($subtotal - $discountAmount, 2);

            if ($total < 0) {
                throw new \DomainException('El descuento no puede superar el subtotal.');
            }

            // Validar que la suma de pagos coincida con el total (tolerancia 1 centavo)
            $paymentsTotal = round(array_sum(array_column($paymentsData, 'amount')), 2);
            if (abs($paymentsTotal - $total) > 0.01) {
                throw new \DomainException(
                    "Los pagos ({$paymentsTotal}) no coinciden con el total ({$total})."
                );
            }

            // ── 4. Verificar stock con lockForUpdate ──────────────────────────
            // Retorna un mapa product_id → Inventory (el registro que se descontará)
            $inventoryMap = $this->reserveStock($draft->store_id, $draftItems);

            // ── 5. Crear Sale ─────────────────────────────────────────────────
            [$totalCommission, $paymentsWithCommission] = $this->calculateCommissions($paymentsData);

            $sale = Sale::create([
                'store_id'            => $draft->store_id,
                'register_session_id' => $draft->register_session_id,
                'user_id'             => $userId,
                'customer_id'         => $draft->customer_id,
                'draft_id'            => $draft->id,
                'subtotal'            => $subtotal,
                'discount'            => $discountAmount,
                'total'               => $total,
                'commission_amount'   => $totalCommission,
                // Dólares físicos recibidos + TC usado (informativo; el MXN ya
                // está en payments/total). Solo se guarda si entraron dólares.
                'cash_received_usd'   => ($cashReceivedUsd !== null && $cashReceivedUsd > 0) ? round($cashReceivedUsd, 2) : null,
                'exchange_rate'       => ($cashReceivedUsd !== null && $cashReceivedUsd > 0) ? $exchangeRate : null,
                'status'              => Sale::STATUS_COMPLETED,
            ]);

            // ── 6. Crear SaleItems ────────────────────────────────────────────
            // Snap del cost del producto al momento EXACTO del INSERT (la
            // invariante que mantiene `sale_items.cost` inmutable aunque el
            // admin re-precie `products.cost` después). El producto ya viene
            // eager-loaded en línea 111 (`->with('product')`), sin query extra.
            foreach ($draftItems as $draftItem) {
                SaleItem::create([
                    'sale_id'    => $sale->id,
                    'product_id' => $draftItem->product_id,
                    'manga_id'   => $draftItem->manga_id,
                    'quantity'   => $draftItem->quantity,
                    'price'      => $draftItem->price,
                    'total'      => $draftItem->total,
                    'cost'       => $draftItem->product?->cost,
                ]);
            }

            // ── 7. Registrar Payments ─────────────────────────────────────────
            foreach ($paymentsWithCommission as $paymentData) {
                Payment::create([
                    'sale_id'           => $sale->id,
                    'payment_method_id' => $paymentData['payment_method_id'],
                    'terminal_id'       => $paymentData['terminal_id'] ?? null,
                    'amount'            => $paymentData['amount'],
                    'commission_amount' => $paymentData['commission_amount'],
                ]);
            }

            // ── 8. Descontar inventario + registrar movimientos ───────────────
            foreach ($draftItems as $draftItem) {
                $inventory = $inventoryMap[$draftItem->product_id];

                $inventory->decrement('quantity', $draftItem->quantity);

                InventoryMovement::create([
                    'product_id'   => $draftItem->product_id,
                    'warehouse_id' => $inventory->warehouse_id,
                    'type'         => 'venta',
                    'quantity'     => $draftItem->quantity,
                    'reference'    => "VENTA-{$sale->id}",
                    'notes'        => null,
                    'user_id'      => $userId,
                ]);
            }

            // ── 9. Cerrar draft ───────────────────────────────────────────────
            $draft->update(['status' => SalesDraft::STATUS_COMPLETED]);

            return $sale->load(['items.product', 'payments.paymentMethod', 'customer']);
        });
    }

    // ─── Helpers privados ─────────────────────────────────────────────────────

    /**
     * Valida que el precio de cada item coincida con un nivel del catálogo del
     * producto (precio base o precio por tienda), salvo que el item esté marcado
     * `is_damaged` (precio manual permitido para mercancía dañada).
     *
     * Si el producto no tiene ningún precio definido, no se valida (no hay contra
     * qué comparar). Tolerancia de 1 centavo.
     *
     * @param array<int,array{product_id:int,price:float,is_damaged?:bool,price_level?:string}> $items
     * @throws \DomainException si un precio no dañado cae fuera del catálogo
     */
    private function assertPricesMatchCatalog(int $storeId, array $items): void
    {
        $productIds = array_values(array_unique(array_map(
            static fn ($i) => (int) $i['product_id'],
            $items,
        )));

        if (empty($productIds)) {
            return;
        }

        $products = Product::query()
            ->with([
                'price',
                'storePrices' => fn ($q) => $q->where('store_id', $storeId),
            ])
            ->whereIn('id', $productIds)
            ->get()
            ->keyBy('id');

        foreach ($items as $item) {
            if (! empty($item['is_damaged'])) {
                continue; // dañado → precio manual permitido
            }

            $product = $products->get((int) $item['product_id']);
            if (! $product) {
                continue; // exists:products ya lo validó; defensivo
            }

            $allowed   = $this->allowedPricesFor($product);
            if (empty($allowed)) {
                continue; // sin precios de catálogo → nada que validar
            }

            $price = round((float) $item['price'], 2);
            $match = false;
            foreach ($allowed as $valid) {
                if (abs($valid - $price) <= 0.01) {
                    $match = true;
                    break;
                }
            }

            if (! $match) {
                $validList = implode(', ', array_map(
                    static fn ($v) => '$' . number_format($v, 2),
                    $allowed,
                ));
                throw new \DomainException(
                    "Precio \${$price} fuera del catálogo para '{$product->name}' "
                    . "(precios válidos: {$validList}). Si es mercancía dañada, márcala como dañada."
                );
            }
        }
    }

    /**
     * Conjunto de precios válidos de un producto para la tienda: por cada nivel
     * 1–5, el precio por tienda si existe, sino el precio base. Solo > 0.
     *
     * @return array<int,float>
     */
    private function allowedPricesFor(Product $product): array
    {
        $base      = $product->price; // ProductPrice (price_1..price_5) o null
        $overrides = $product->storePrices->keyBy('price_level'); // nivel(int) → row

        $allowed = [];
        for ($level = 1; $level <= 5; $level++) {
            $value = $overrides->get($level)?->price
                ?? $base?->{"price_{$level}"};
            if ($value !== null && (float) $value > 0) {
                $allowed[] = round((float) $value, 2);
            }
        }

        return array_values(array_unique($allowed));
    }

    /**
     * Verifica stock para todos los ítems y retorna el mapa product_id → Inventory.
     * Usa lockForUpdate() para prevenir race conditions entre cajeros.
     *
     * Caja vende SOLO de Exhibición (`warehouses.type='store'`): el front de la
     * tienda. La Bodega (`type='bodega'`) es backstock no vendible — para vender
     * de ahí hay que mover el stock a Exhibición primero.
     *
     * @return array<int, Inventory>
     * @throws \DomainException si falta stock para algún producto
     */
    private function reserveStock(int $storeId, Collection $draftItems): array
    {
        $inventoryMap = [];

        // Orden de lock determinístico por product_id. Sin esto, dos cajeros que
        // cobran simultáneo con orden distinto de items pueden hacer deadlock
        // (A bloquea producto 1→2, B bloquea 2→1 → MySQL aborta una transacción).
        $orderedItems = $draftItems->sortBy('product_id')->values();

        // Prefetch de bodegas activas de la tienda — una sola query antes del
        // loop reemplaza N×2 subqueries correlacionadas (`whereHas`) por item.
        // Cloud SQL ejecuta `whereIn` con índice directo sobre warehouse_id en
        // lugar de un EXISTS por cada lookup de inventario.
        $warehouseIds = \App\Models\Warehouse::query()
            ->where('store_id', $storeId)
            ->where('type', 'store') // Solo Exhibición — la Bodega no se vende en Caja
            ->where('active', true)
            ->pluck('id')
            ->all();

        foreach ($orderedItems as $item) {
            // ADR-014: el carrito vive client-side. Ya no consultamos sales_drafts
            // para "reservar" stock — el lockForUpdate de abajo es suficiente
            // para impedir oversell entre dos checkouts simultáneos: el primero
            // gana, el segundo lee el stock ya descontado y falla.
            //
            // Una sola query trae TODAS las filas de inventario de este producto
            // en las bodegas de la tienda, con lock. Calculamos stock total y
            // elegimos la bodega objetivo en PHP — antes hacíamos 2 queries por
            // item (sum + first).
            $inventories = empty($warehouseIds)
                ? collect()
                : Inventory::query()
                    ->lockForUpdate()
                    ->where('product_id', $item->product_id)
                    ->whereIn('warehouse_id', $warehouseIds)
                    ->orderByDesc('quantity')
                    ->get();

            $stockInStore = (float) $inventories->sum('quantity');

            if ($stockInStore < $item->quantity) {
                $name = $item->product?->name ?? "producto ID:{$item->product_id}";

                // Pista de bodega: si hay backstock atrás, avisar para que lo
                // muevan a Exhibición en vez de pensar que no hay nada.
                $bodegaQty = (float) Inventory::query()
                    ->where('product_id', $item->product_id)
                    ->whereHas('warehouse', fn ($wq) => $wq
                        ->where('store_id', $storeId)
                        ->where('type', 'bodega')
                        ->where('active', true))
                    ->sum('quantity');

                // Formato compatible con el regex del frontend (SellPage.handleCheckoutError),
                // que auto-ajusta la qty del carrito al disponible real cuando la venta falla.
                $suffix = $bodegaQty > 0
                    ? " Hay {$bodegaQty} en bodega — muévelo a Exhibición para venderlo."
                    : ($stockInStore <= 0 ? " Otro cajero acaba de vender las últimas unidades." : '');
                throw new \DomainException(
                    "Stock insuficiente en Exhibición para '{$name}'. Disponible: {$stockInStore}, solicitado: {$item->quantity}.{$suffix}"
                );
            }

            // Asignar a UNA bodega con stock suficiente para el descuento físico.
            // Preferimos la de mayor cantidad para minimizar fragmentación.
            $inventory = $inventories->first(fn ($inv) => (float) $inv->quantity >= (float) $item->quantity);

            // Fallback raro: stock total alcanza pero ninguna bodega individual
            // tiene la cantidad solicitada — inventario fragmentado entre varias
            // bodegas. Hoy no soportamos descuento split.
            if (! $inventory) {
                $name = $item->product?->name ?? "producto ID:{$item->product_id}";
                throw new \DomainException(
                    "Stock disponible para '{$name}' pero ninguna bodega individual tiene {$item->quantity} unidades — inventario fragmentado, contacta admin."
                );
            }

            $inventoryMap[$item->product_id] = $inventory;
        }

        return $inventoryMap;
    }

    /**
     * Calcula las comisiones por terminal para cada pago.
     *
     * @return array{float, array}  [totalCommission, paymentsWithCommission]
     */
    private function calculateCommissions(array $paymentsData): array
    {
        $totalCommission = 0.0;
        $result          = [];

        foreach ($paymentsData as $payment) {
            $commission = 0.0;

            if (! empty($payment['terminal_id'])) {
                $terminal = Terminal::find($payment['terminal_id']);
                if ($terminal) {
                    $commission = round($payment['amount'] * $terminal->commission_percent / 100, 2);
                }
            }

            $totalCommission += $commission;
            $result[] = array_merge($payment, ['commission_amount' => $commission]);
        }

        return [round($totalCommission, 2), $result];
    }

    /**
     * Guard server-side de restricciones de pago por producto (QA crítico
     * 2026-06-08): un producto con allow_card=false NO puede cobrarse con
     * tarjeta, y uno con allow_cash=false NO con efectivo/transferencia.
     * Antes solo la UI lo validaba (y tenía el mapeo roto) — el backend
     * aceptaba cualquier combinación. La clasificación tarjeta/efectivo es
     * por nombre del método ("Tarjeta Débito"/"Tarjeta Crédito" del seeder).
     *
     * @throws \DomainException con mensaje legible
     */
    private function assertPaymentMethodsAllowed(Collection $draftItems, array $paymentsData): void
    {
        $methodIds = array_values(array_unique(array_column($paymentsData, 'payment_method_id')));
        $methods   = PaymentMethod::whereIn('id', $methodIds)->get()->keyBy('id');

        $usesCard = false;
        $usesCash = false;
        foreach ($methodIds as $id) {
            if ($methods[$id]?->isCard()) {
                $usesCard = true;
            } else {
                $usesCash = true; // efectivo, dólares, transferencia, etc.
            }
        }

        foreach ($draftItems as $item) {
            $restriction = $item->product?->paymentMethod;
            $allowCash   = $restriction?->allow_cash ?? true;
            $allowCard   = $restriction?->allow_card ?? true;
            $name        = $item->product?->name ?? "Producto #{$item->product_id}";

            if ($usesCard && ! $allowCard) {
                throw new \DomainException("\"{$name}\" solo acepta efectivo — no se puede cobrar con tarjeta.");
            }
            if ($usesCash && ! $allowCash) {
                throw new \DomainException("\"{$name}\" solo acepta tarjeta — no se puede cobrar en efectivo/transferencia.");
            }
        }
    }
}
