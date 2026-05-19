<?php

namespace App\Services;

use App\Models\Inventory;
use App\Models\InventoryMovement;
use App\Models\Payment;
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
    ): Sale {
        return DB::transaction(function () use ($storeId, $registerSessionId, $customerId, $items, $paymentsData, $discount, $userId) {
            $draft = SalesDraft::create([
                'store_id'            => $storeId,
                'register_session_id' => $registerSessionId,
                'user_id'             => $userId,
                'customer_id'         => $customerId,
                'status'              => SalesDraft::STATUS_OPEN,
            ]);

            foreach ($items as $item) {
                SalesDraftItem::create([
                    'draft_id'    => $draft->id,
                    'product_id'  => (int) $item['product_id'],
                    'quantity'    => (float) $item['quantity'],
                    'price'       => (float) $item['price'],
                    // 'total' lo computa el booted() del modelo
                ]);
            }

            // Delegamos al checkout clásico — toda la lógica de stock, locks,
            // payments, descuento de inventario, ya está probada.
            return $this->checkout(
                draftId:      $draft->id,
                paymentsData: $paymentsData,
                discount:     $discount,
                userId:       $userId,
            );
        });
    }

    public function checkout(
        int $draftId,
        array $paymentsData,
        float $discount,
        int $userId
    ): Sale {
        return DB::transaction(function () use ($draftId, $paymentsData, $discount, $userId) {

            // ── 1. Lock draft y validar estado ────────────────────────────────
            $draft = SalesDraft::lockForUpdate()->findOrFail($draftId);

            if (! in_array($draft->status, [SalesDraft::STATUS_OPEN, SalesDraft::STATUS_SUSPENDED])) {
                throw new \DomainException(
                    "El draft #{$draftId} no está activo (estado actual: {$draft->status})."
                );
            }

            // ── 2. Cargar items y validar que no esté vacío ───────────────────
            $draftItems = $draft->items()->with('product')->get();

            if ($draftItems->isEmpty()) {
                throw new \DomainException('No hay productos en la venta.');
            }

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
            $inventoryMap = $this->reserveStock($draft->store_id, $draftItems, $draft->id);

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
                'status'              => Sale::STATUS_COMPLETED,
            ]);

            // ── 6. Crear SaleItems ────────────────────────────────────────────
            foreach ($draftItems as $draftItem) {
                SaleItem::create([
                    'sale_id'    => $sale->id,
                    'product_id' => $draftItem->product_id,
                    'manga_id'   => $draftItem->manga_id,
                    'quantity'   => $draftItem->quantity,
                    'price'      => $draftItem->price,
                    'total'      => $draftItem->total,
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
     * Verifica stock para todos los ítems y retorna el mapa product_id → Inventory.
     * Usa lockForUpdate() para prevenir race conditions entre cajeros.
     *
     * Estrategia de selección de bodega:
     *   1. Bodega de la tienda (warehouses.store_id = store_id) con stock suficiente
     *   2. Fallback: cualquier bodega con stock suficiente
     *
     * @return array<int, Inventory>
     * @throws \DomainException si falta stock para algún producto
     */
    private function reserveStock(int $storeId, Collection $draftItems, ?int $excludeDraftId = null): array
    {
        $inventoryMap = [];

        // Orden de lock determinístico por product_id. Sin esto, dos cajeros que
        // cobran simultáneo con orden distinto de items pueden hacer deadlock
        // (A bloquea producto 1→2, B bloquea 2→1 → MySQL aborta una transacción).
        $orderedItems = $draftItems->sortBy('product_id')->values();

        foreach ($orderedItems as $item) {
            // 1. Stock TOTAL en la tienda (agregado sobre todas las bodegas del store).
            //    El inventario puede estar fragmentado entre bodegas; la disponibilidad
            //    real para vender es la suma de las bodegas activas de la tienda.
            $stockInStore = (float) Inventory::query()
                ->where('product_id', $item->product_id)
                ->whereHas('warehouse', fn ($q) => $q
                    ->where('store_id', $storeId)
                    ->where('active', true)
                )
                ->sum('quantity');

            // 2. Reservas por OTROS drafts open de la misma tienda. Sin esto, dos
            //    cajeros pueden pasar la validación con el último producto y el
            //    segundo descuenta a negativo.
            $reservedByOthers = (float) DB::table('sales_draft_items as sdi')
                ->join('sales_drafts as sd', 'sd.id', '=', 'sdi.draft_id')
                ->where('sdi.product_id', $item->product_id)
                ->where('sd.store_id', $storeId)
                ->where('sd.status', SalesDraft::STATUS_OPEN)
                ->when($excludeDraftId !== null, fn ($q) => $q->where('sd.id', '!=', $excludeDraftId))
                ->sum('sdi.quantity');

            $availableForMe = $stockInStore - $reservedByOthers;

            if ($availableForMe < $item->quantity) {
                $name = $item->product?->name ?? "producto ID:{$item->product_id}";
                $msg = $reservedByOthers > 0
                    ? "Stock insuficiente para '{$name}'. Otros cajeros reservaron {$reservedByOthers}, disponible para ti: {$availableForMe}, solicitado: {$item->quantity}."
                    : "Stock insuficiente para '{$name}'. Disponible: {$availableForMe}, solicitado: {$item->quantity}.";
                throw new \DomainException($msg);
            }

            // 3. Asignar a UNA bodega para el descuento físico. Preferimos la
            //    bodega con más stock para minimizar fragmentación. lockForUpdate
            //    previene que dos checkouts simultáneos descuenten la misma fila.
            $inventory = Inventory::query()
                ->lockForUpdate()
                ->where('product_id', $item->product_id)
                ->where('quantity', '>=', $item->quantity)
                ->whereHas('warehouse', fn ($q) => $q
                    ->where('store_id', $storeId)
                    ->where('active', true)
                )
                ->orderByDesc('quantity')
                ->first();

            // Fallback: cualquier bodega con stock suficiente (situación rara —
            // tienda sin bodegas asignadas).
            $inventory ??= Inventory::query()
                ->lockForUpdate()
                ->where('product_id', $item->product_id)
                ->where('quantity', '>=', $item->quantity)
                ->orderByDesc('quantity')
                ->first();

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
}
