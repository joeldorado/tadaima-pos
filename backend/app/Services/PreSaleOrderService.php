<?php

namespace App\Services;

use App\Models\PreSaleCatalog;
use App\Models\PreSaleDelivery;
use App\Models\PreSaleOrder;
use App\Models\PreSaleOrderItem;
use App\Models\PreSaleOrderLog;
use App\Models\PreSaleOrderPayment;
use App\Support\PreSaleAudit;
use Illuminate\Support\Facades\DB;

class PreSaleOrderService
{
    /** Tolerancia de centavos al comparar montos. */
    public const MONEY_TOLERANCE = 0.01;

    // ─── Create folio ─────────────────────────────────────────────────────────

    /**
     * Creates a pre-sale order (folio) with items and records the initial anticipo.
     *
     * Flow (single DB::transaction):
     *  1. Validate each catalog is published
     *  2. Check preorder_limit per catalog (reserved + new quantity ≤ limit)
     *  3. Create PreSaleOrder (status = pending)
     *  4. Assign code based on generated id (PREV-XXXXX)
     *  5. Create PreSaleOrderItem for each line (unit_price frozen from catalog)
     *  6. If advance_amount > 0, create PreSaleOrderPayment
     *  7. Log creation
     *
     * @throws \DomainException on limit exceeded or invalid catalog
     */
    public function createOrder(array $data, int $userId): PreSaleOrder
    {
        return DB::transaction(function () use ($data, $userId) {
            $items = $data['items'];

            // ── Validate catalogs and limits ──────────────────────────────────
            $catalogIds = array_column($items, 'catalog_id');
            $storeId    = (int) $data['store_id'];
            $catalogs = PreSaleCatalog::with(['activeOrderItems', 'storeLimits'])
                ->lockForUpdate()
                ->findMany($catalogIds)
                ->keyBy('id');

            // Cliente para el límite POR CLIENTE — identidad amplia (mismo
            // cliente / teléfono / socio Tadaima) para que registros duplicados
            // de la misma persona cuenten juntos.
            $customer    = \App\Models\Customer::find($data['customer_id']);
            $customerIds = $customer ? $customer->sameIdentityIds() : [(int) ($data['customer_id'] ?? 0)];

            foreach ($items as $line) {
                $catalogId = (int) $line['catalog_id'];
                $catalog   = $catalogs->get($catalogId);

                if (!$catalog || $catalog->status !== PreSaleCatalog::STATUS_PUBLISHED) {
                    throw new \DomainException(
                        "El catálogo ID:{$catalogId} no está disponible para venta."
                    );
                }

                $this->assertCapacity($catalog, $storeId, (int) $line['quantity'], $customerIds);
            }

            // ── Validate advance_amount does not exceed total price ───────────
            $advanceAmount = (float) ($data['advance_amount'] ?? 0);
            $totalPrice = 0.0;
            foreach ($items as $line) {
                $catalog    = $catalogs->get((int) $line['catalog_id']);
                $priceField = 'price_' . (int) ($line['price_level'] ?? 1);
                $unitPrice  = (float) ($catalog->{$priceField} ?? $catalog->price_1 ?? 0);
                $totalPrice += $unitPrice * (int) $line['quantity'];
            }
            if ($advanceAmount > $totalPrice) {
                throw new \DomainException(
                    "El anticipo (\${$advanceAmount}) no puede exceder el precio total del folio (\${$totalPrice})."
                );
            }

            // ── Create order ──────────────────────────────────────────────────
            $order = PreSaleOrder::create([
                'code'            => 'PREV-TEMP',
                'store_id'        => $data['store_id'],
                'linked_sale_id'  => $data['linked_sale_id'] ?? null,
                'user_id'         => $userId,
                'customer_id'     => $data['customer_id'],
                'status'          => PreSaleOrder::STATUS_PENDING,
                'pickup_deadline' => null,
                'notes'           => $data['notes'] ?? null,
            ]);

            $order->update(['code' => 'PREV-' . str_pad($order->id, 5, '0', STR_PAD_LEFT)]);

            // ── Create items ──────────────────────────────────────────────────
            foreach ($items as $line) {
                $catalog    = $catalogs->get((int) $line['catalog_id']);
                $priceLevel = (int) ($line['price_level'] ?? 1);
                $priceField = 'price_' . $priceLevel;
                $unitPrice  = (float) ($catalog->{$priceField} ?? $catalog->price_1 ?? 0);

                // Snap del cost al momento de crear el folio:
                //  - Si el catálogo está vinculado a Product → usa products.cost
                //  - Si no (mercancía no llegada) → fallback a catalog.cost
                //    (cost del proveedor en data maestra del catálogo).
                // NO se re-snap al vincular product después — el folio queda
                // con el cost al momento exacto de su creación.
                $snappedCost = null;
                if ($catalog->product_id) {
                    $snappedCost = \App\Models\Product::whereKey($catalog->product_id)->value('cost');
                }
                if ($snappedCost === null && $catalog->cost !== null) {
                    $snappedCost = (float) $catalog->cost;
                }

                PreSaleOrderItem::create([
                    'pre_sale_order_id'   => $order->id,
                    'pre_sale_catalog_id' => $catalog->id,
                    'product_id'          => $catalog->product_id,
                    'quantity'            => (int) $line['quantity'],
                    'price_level'         => $priceLevel,
                    'unit_price'          => $unitPrice,
                    'cost'                => $snappedCost,
                    'status'              => PreSaleOrderItem::STATUS_PENDING,
                ]);
            }

            // ── Initial anticipo payment ──────────────────────────────────────
            if ($advanceAmount > 0) {
                PreSaleOrderPayment::create([
                    'pre_sale_order_id' => $order->id,
                    'amount'            => $advanceAmount,
                    'payment_method_id' => $data['payment_method_id'] ?? null,
                    'cashier_id'        => $userId,
                    'notes'             => 'Anticipo inicial',
                ]);
            }

            // ── Log creation ──────────────────────────────────────────────────
            PreSaleOrderLog::create([
                'pre_sale_order_id' => $order->id,
                'user_id'           => $userId,
                'from_status'       => null,
                'to_status'         => PreSaleOrder::STATUS_PENDING,
                'notes'             => $advanceAmount > 0
                    ? "Folio creado. Anticipo: \${$advanceAmount}"
                    : 'Folio creado.',
            ]);

            return $order->load(['customer', 'items.catalog', 'payments', 'logs']);
        });
    }

    /**
     * Cupo de un catálogo para `$qty` piezas más: stock por tienda y límite por
     * cliente.
     *
     * @param  array<int, int>  $customerIds  identidad amplia del cliente (`Customer::sameIdentityIds`)
     * @throws \DomainException si no cabe
     */
    public function assertCapacity(PreSaleCatalog $catalog, int $storeId, int $qty, array $customerIds): void
    {
        // Stock por tienda obligatorio. Sin entrada en store_limits → 0
        // disponible en esa tienda (no se vende). Ver PreSaleCatalog::limitForStore.
        $limit    = $catalog->limitForStore($storeId);
        $reserved = $catalog->reservedCountForStore($storeId);

        if ($limit <= 0) {
            throw new \DomainException(
                "'{$catalog->product_name}' no está disponible para venta en esta tienda. Pídele al admin asignar stock en el tab Stock del catálogo."
            );
        }

        if ($reserved + $qty > $limit) {
            $available = max(0, $limit - $reserved);
            throw new \DomainException(
                "'{$catalog->product_name}' solo tiene {$available} unidades disponibles (límite: {$limit})."
            );
        }

        // Límite POR CLIENTE (de por vida en este catálogo: cuenta
        // pending+ready+delivered, no cancelados). null = sin límite.
        $perCustomerLimit = $catalog->limit_per_customer;
        if ($perCustomerLimit !== null) {
            $customerReserved = $catalog->reservedCountForCustomerIds($customerIds);
            if ($customerReserved + $qty > $perCustomerLimit) {
                $left = max(0, $perCustomerLimit - $customerReserved);
                throw new \DomainException(
                    "'{$catalog->product_name}' tiene un límite de {$perCustomerLimit} por cliente. "
                    . ($left > 0
                        ? "Este cliente ya tiene {$customerReserved}, solo puede llevar {$left} más."
                        : "Este cliente ya tiene {$customerReserved} — no se le puede vender más.")
                );
            }
        }
    }

    // ─── Add payment (abono) ──────────────────────────────────────────────────

    /**
     * Records an additional anticipo or liquidation payment.
     *
     * @throws \DomainException if order is not open (pending or ready)
     */
    public function addPayment(PreSaleOrder $order, array $data, int $userId): PreSaleOrderPayment
    {
        return DB::transaction(function () use ($order, $data, $userId) {
            $order = PreSaleOrder::lockForUpdate()->find($order->id);

            if (!in_array($order->status, PreSaleOrder::OPEN_STATUSES)) {
                throw new \DomainException(
                    "El folio {$order->code} no está abierto (estado: {$order->status})."
                );
            }

            return $this->recordPayment($order, $data, $userId)->load(['paymentMethod', 'cashier']);
        });
    }

    /**
     * Guarda un pago del folio y lo deja en su historial. Debe llamarse dentro
     * de una transacción con el folio bloqueado.
     *
     * @param  array{amount: float|int|string, payment_method_id?: int|null, notes?: string|null}  $data
     */
    private function recordPayment(PreSaleOrder $order, array $data, int $userId): PreSaleOrderPayment
    {
        $amount = round((float) $data['amount'], 2);

        $payment = PreSaleOrderPayment::create([
            'pre_sale_order_id' => $order->id,
            'amount'            => $amount,
            'payment_method_id' => $data['payment_method_id'] ?? null,
            'cashier_id'        => $userId,
            'notes'             => $data['notes'] ?? null,
        ]);

        PreSaleOrderLog::create([
            'pre_sale_order_id' => $order->id,
            'user_id'           => $userId,
            'from_status'       => $order->status,
            'to_status'         => $order->status,
            'notes'             => "Abono \${$amount}",
        ]);

        return $payment;
    }

    // ─── Mark ready (admin — merchandise arrived) ─────────────────────────────

    /**
     * Transitions pending → ready. Admin calls this when merchandise arrives.
     *
     * @throws \DomainException if not pending
     */
    public function markReady(PreSaleOrder $order, int $userId, ?string $pickupDeadline = null, ?string $notes = null): PreSaleOrder
    {
        return DB::transaction(function () use ($order, $userId, $pickupDeadline, $notes) {
            $order = PreSaleOrder::lockForUpdate()->find($order->id);

            if ($order->status !== PreSaleOrder::STATUS_PENDING) {
                throw new \DomainException(
                    "El folio {$order->code} no está pendiente (estado: {$order->status})."
                );
            }

            $deadline = $pickupDeadline
                ?? $this->resolvePickupDeadline($order->id);

            $order->update([
                'status'          => PreSaleOrder::STATUS_READY,
                'pickup_deadline' => $deadline,
            ]);

            PreSaleOrderLog::create([
                'pre_sale_order_id' => $order->id,
                'user_id'           => $userId,
                'from_status'       => PreSaleOrder::STATUS_PENDING,
                'to_status'         => PreSaleOrder::STATUS_READY,
                'notes'             => $notes ?? 'Mercancía disponible — folio listo para liquidar.',
            ]);

            return $order->fresh(['customer', 'items.catalog', 'payments', 'logs']);
        });
    }

    // ─── Liquidate (cashier — deliver to customer) ────────────────────────────

    /**
     * Entrega partidas de un folio LISTO.
     *
     * Dos formas de llamarlo:
     *  - Flujo de siempre (sin `$itemIds` ni `$payment`; lo usa la app móvil):
     *    entrega TODAS las partidas pendientes cuyo catálogo ya llegó. No valida
     *    dinero ni registra la entrega.
     *  - Entrega elegida (2026-11-13): `$itemIds` = las partidas que el cliente
     *    se lleva hoy y `$payment` = el cobro de esa entrega, todo en una sola
     *    transacción (si algo falla, el pago tampoco queda). Exige que lo
     *    pagado cubra lo entregado y deja la entrega en `pre_sale_deliveries`
     *    con su pago, para poder revertirla exacta después.
     *
     * El folio pasa a `delivered` solo cuando no queda ninguna partida pendiente.
     *
     * @param  array<int, int>|null  $itemIds
     * @param  array{amount: float|int|string, payment_method_id?: int|null}|null  $payment
     * @throws \DomainException si el folio no está listo o la entrega no procede
     */
    public function liquidate(
        PreSaleOrder $order,
        int $userId,
        ?string $notes = null,
        ?array $itemIds = null,
        ?array $payment = null,
    ): PreSaleOrder {
        return DB::transaction(function () use ($order, $userId, $notes, $itemIds, $payment) {
            $order = PreSaleOrder::lockForUpdate()->find($order->id);

            if ($order->status !== PreSaleOrder::STATUS_READY) {
                throw new \DomainException(
                    "El folio {$order->code} no está listo para liquidar (estado: {$order->status})."
                );
            }

            $tracked = $itemIds !== null || $payment !== null;
            if ($tracked) {
                // Candado folio → catálogo: mientras se entrega, el estado de los
                // catálogos de este folio no puede cambiar por debajo.
                PreSaleCatalog::whereIn('id', PreSaleOrderItem::where('pre_sale_order_id', $order->id)->select('pre_sale_catalog_id'))
                    ->orderBy('id')
                    ->lockForUpdate()
                    ->get(['id']);
            }
            $items = $this->itemsToDeliver($order, $itemIds);

            // Un cobro sin nada que entregar quedaría suelto en el folio (sin
            // entrega que lo respalde). Pasa con un carrito guardado que ya no
            // corresponde al folio: mejor rechazar y que lo vuelvan a cargar.
            if ($tracked && $items->isEmpty()) {
                throw new \DomainException(
                    "El folio {$order->code} no tiene partidas por entregar. Vuelve a cargarlo en Caja."
                );
            }

            // ── Candado de costo (etapa 2) ────────────────────────────────────
            // Entregar CONGELA el costo de la partida para siempre. Si nadie lo
            // capturó, congelaríamos un vacío y el reporte diría utilidad = 100%
            // de lo cobrado. Esta es la última oportunidad de capturarlo.
            // Se exige costo MAYOR A 0 (null y 0 se tratan igual).
            $sinCosto = $items->filter(fn (PreSaleOrderItem $it) => (float) ($it->cost ?? 0) <= 0);
            if ($sinCosto->isNotEmpty()) {
                $nombres = $sinCosto
                    ->map(fn ($it) => $it->catalog?->product_name ?? "Partida #{$it->id}")
                    ->unique()->implode(', ');
                throw new \DomainException(
                    "No se puede liquidar el folio {$order->code}: falta capturar el costo real de: {$nombres}. "
                    . 'Captúralo en el catálogo de preventa (pestaña Precios → Costo).'
                );
            }

            $paymentRow = $tracked ? $this->chargeDelivery($order, $payment, $userId) : null;

            $delivery = $tracked && $items->isNotEmpty()
                ? PreSaleDelivery::create([
                    'pre_sale_order_id' => $order->id,
                    'user_id'           => $userId,
                    'payment_id'        => $paymentRow?->id,
                    'amount'            => $paymentRow?->amount ?? 0,
                ])
                : null;

            if ($items->isNotEmpty()) {
                PreSaleOrderItem::whereIn('id', $items->pluck('id'))->update([
                    'status'       => PreSaleOrderItem::STATUS_DELIVERED,
                    'delivered_at' => now(),
                    'delivery_id'  => $delivery?->id,
                ]);
            }

            if ($tracked) {
                $this->assertPaidCoversDelivered($order);
            }

            // Only close the folio when ALL items are delivered
            $pendingCount = PreSaleOrderItem::where('pre_sale_order_id', $order->id)
                ->where('status', PreSaleOrderItem::STATUS_PENDING)
                ->count();

            if ($pendingCount === 0) {
                $order->update(['status' => PreSaleOrder::STATUS_DELIVERED]);

                PreSaleOrderLog::create([
                    'pre_sale_order_id' => $order->id,
                    'user_id'           => $userId,
                    'from_status'       => PreSaleOrder::STATUS_READY,
                    'to_status'         => PreSaleOrder::STATUS_DELIVERED,
                    'notes'             => $notes ?? 'Mercancía entregada al cliente.',
                ]);
            } else {
                PreSaleOrderLog::create([
                    'pre_sale_order_id' => $order->id,
                    'user_id'           => $userId,
                    'from_status'       => PreSaleOrder::STATUS_READY,
                    'to_status'         => PreSaleOrder::STATUS_READY,
                    'notes'             => $notes ?? "Entrega parcial — {$pendingCount} ítem(s) pendientes.",
                ]);
            }

            if ($delivery) {
                PreSaleAudit::delivery($order, $delivery, $items, $pendingCount, $userId);
            }

            return $order->fresh(['customer', 'items.catalog', 'items.delivery:id,payment_id', 'payments', 'logs']);
        });
    }

    /**
     * Partidas que se entregan en esta llamada.
     *
     * Sin `$itemIds`: todas las pendientes cuyo catálogo ya llegó (flujo de
     * siempre). Con `$itemIds`: exactamente esas, y cada una debe ser del folio,
     * estar pendiente y tener su catálogo en «llegó».
     *
     * @param  array<int, int>|null  $itemIds
     * @return \Illuminate\Database\Eloquent\Collection<int, PreSaleOrderItem>
     */
    private function itemsToDeliver(PreSaleOrder $order, ?array $itemIds)
    {
        $query = PreSaleOrderItem::with('catalog:id,product_name,status')
            ->where('pre_sale_order_id', $order->id);

        if ($itemIds === null) {
            return $query
                ->where('status', PreSaleOrderItem::STATUS_PENDING)
                ->whereIn('pre_sale_catalog_id', function ($q) {
                    $q->select('id')
                      ->from('pre_sale_catalogs')
                      ->where('status', PreSaleCatalog::STATUS_ARRIVED);
                })
                ->get();
        }

        $ids   = array_values(array_unique(array_map('intval', $itemIds)));
        $items = $query->whereIn('id', $ids)->get();

        if ($ids === [] || $items->count() !== count($ids)) {
            throw new \DomainException(
                "Alguna partida no pertenece al folio {$order->code}. Vuelve a cargar el folio en Caja."
            );
        }

        foreach ($items as $item) {
            $nombre = $item->catalog?->product_name ?? "Partida #{$item->id}";
            if ($item->status !== PreSaleOrderItem::STATUS_PENDING) {
                throw new \DomainException("\"{$nombre}\" ya estaba entregada. Vuelve a cargar el folio en Caja.");
            }
            if ($item->catalog?->status !== PreSaleCatalog::STATUS_ARRIVED) {
                throw new \DomainException("\"{$nombre}\" todavía no llega: no se puede entregar.");
            }
        }

        return $items;
    }

    /**
     * Cobro de una entrega. Null si la entrega no lleva cobro (el anticipo ya
     * cubría). No acepta cobrar más que el saldo del folio.
     *
     * @param  array{amount: float|int|string, payment_method_id?: int|null}|null  $payment
     */
    private function chargeDelivery(PreSaleOrder $order, ?array $payment, int $userId): ?PreSaleOrderPayment
    {
        $amount = round((float) ($payment['amount'] ?? 0), 2);
        if ($amount <= 0) {
            return null;
        }

        $order->load(['items', 'payments']);
        if ($amount > $order->balance + self::MONEY_TOLERANCE) {
            throw new \DomainException(
                "El cobro (\${$amount}) excede el saldo del folio {$order->code} (\${$order->balance})."
            );
        }

        return $this->recordPayment($order, [
            'amount'            => $amount,
            'payment_method_id' => $payment['payment_method_id'] ?? null,
            'notes'             => 'Liquidación',
        ], $userId);
    }

    /**
     * Invariante de dinero de las preventas: lo pagado debe cubrir el total de
     * las partidas ya entregadas. Lo que sobra es el anticipo de las pendientes.
     *
     * @throws \DomainException
     */
    public function assertPaidCoversDelivered(PreSaleOrder $order): void
    {
        $delivered = (float) PreSaleOrderItem::where('pre_sale_order_id', $order->id)
            ->where('status', PreSaleOrderItem::STATUS_DELIVERED)
            ->get()
            ->sum(fn (PreSaleOrderItem $it) => $it->quantity * $it->unit_price);
        $paid = (float) PreSaleOrderPayment::where('pre_sale_order_id', $order->id)->sum('amount');

        if ($paid + self::MONEY_TOLERANCE < $delivered) {
            $falta = number_format($delivered - $paid, 2);
            throw new \DomainException(
                "Lo pagado no cubre lo que se entrega del folio {$order->code}: faltan \${$falta}."
            );
        }
    }

    // ─── Expire ───────────────────────────────────────────────────────────────

    /**
     * Transitions pending|ready → expired. Called by scheduler or manually.
     *
     * @throws \DomainException if order is not open
     */
    public function expire(PreSaleOrder $order, int $userId, ?string $notes = null): PreSaleOrder
    {
        return DB::transaction(function () use ($order, $userId, $notes) {
            $order = PreSaleOrder::lockForUpdate()->find($order->id);

            if (!in_array($order->status, PreSaleOrder::OPEN_STATUSES)) {
                throw new \DomainException(
                    "El folio {$order->code} no puede vencerse (estado: {$order->status})."
                );
            }

            $fromStatus = $order->status;
            $order->update(['status' => PreSaleOrder::STATUS_EXPIRED]);

            PreSaleOrderLog::create([
                'pre_sale_order_id' => $order->id,
                'user_id'           => $userId,
                'from_status'       => $fromStatus,
                'to_status'         => PreSaleOrder::STATUS_EXPIRED,
                'notes'             => $notes ?? 'Fecha límite de retiro vencida.',
            ]);

            return $order->fresh(['customer', 'items', 'logs']);
        });
    }

    // ─── Cancel ───────────────────────────────────────────────────────────────

    /**
     * Transitions pending|ready → cancelled.
     *
     * @throws \DomainException if order is not open
     */
    public function cancel(PreSaleOrder $order, int $userId, ?string $notes = null): PreSaleOrder
    {
        return DB::transaction(function () use ($order, $userId, $notes) {
            $order = PreSaleOrder::lockForUpdate()->find($order->id);

            if (!in_array($order->status, PreSaleOrder::OPEN_STATUSES)) {
                throw new \DomainException(
                    "El folio {$order->code} no puede cancelarse (estado: {$order->status})."
                );
            }

            $fromStatus = $order->status;
            $order->update(['status' => PreSaleOrder::STATUS_CANCELLED]);

            PreSaleOrderLog::create([
                'pre_sale_order_id' => $order->id,
                'user_id'           => $userId,
                'from_status'       => $fromStatus,
                'to_status'         => PreSaleOrder::STATUS_CANCELLED,
                'notes'             => $notes,
            ]);

            return $order->fresh(['customer', 'items', 'logs']);
        });
    }

    // ─── Private helpers ──────────────────────────────────────────────────────

    public function resolvePickupDeadline(int $orderId): ?string
    {
        return PreSaleOrderItem::where('pre_sale_order_id', $orderId)
            ->join('pre_sale_catalogs', 'pre_sale_catalogs.id', '=', 'pre_sale_order_items.pre_sale_catalog_id')
            ->max('pre_sale_catalogs.pickup_deadline');
    }
}
