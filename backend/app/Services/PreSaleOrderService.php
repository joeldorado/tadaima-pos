<?php

namespace App\Services;

use App\Models\PreSaleCatalog;
use App\Models\PreSaleOrder;
use App\Models\PreSaleOrderItem;
use App\Models\PreSaleOrderLog;
use App\Models\PreSaleOrderPayment;
use Illuminate\Support\Facades\DB;

class PreSaleOrderService
{
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
            $catalogs = PreSaleCatalog::with('activeOrderItems')
                ->lockForUpdate()
                ->findMany($catalogIds)
                ->keyBy('id');

            foreach ($items as $line) {
                $catalogId = (int) $line['catalog_id'];
                $catalog   = $catalogs->get($catalogId);

                if (!$catalog || $catalog->status !== PreSaleCatalog::STATUS_PUBLISHED) {
                    throw new \DomainException(
                        "El catálogo ID:{$catalogId} no está disponible para venta."
                    );
                }

                if ($catalog->preorder_limit !== null) {
                    $reserved = (int) $catalog->activeOrderItems->sum('quantity');
                    $qty      = (int) $line['quantity'];

                    if ($reserved + $qty > $catalog->preorder_limit) {
                        $available = max(0, $catalog->preorder_limit - $reserved);
                        throw new \DomainException(
                            "'{$catalog->product_name}' solo tiene {$available} unidades disponibles (límite: {$catalog->preorder_limit})."
                        );
                    }
                }
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

                PreSaleOrderItem::create([
                    'pre_sale_order_id'   => $order->id,
                    'pre_sale_catalog_id' => $catalog->id,
                    'product_id'          => $catalog->product_id,
                    'quantity'            => (int) $line['quantity'],
                    'price_level'         => $priceLevel,
                    'unit_price'          => $unitPrice,
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

            return $payment->load(['paymentMethod', 'cashier']);
        });
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
     * Transitions ready → delivered. Marks all pending items as delivered.
     *
     * @throws \DomainException if not ready
     */
    public function liquidate(PreSaleOrder $order, int $userId, ?string $notes = null): PreSaleOrder
    {
        return DB::transaction(function () use ($order, $userId, $notes) {
            $order = PreSaleOrder::lockForUpdate()->find($order->id);

            if ($order->status !== PreSaleOrder::STATUS_READY) {
                throw new \DomainException(
                    "El folio {$order->code} no está listo para liquidar (estado: {$order->status})."
                );
            }

            // Mark items whose catalog has arrived as delivered
            PreSaleOrderItem::where('pre_sale_order_id', $order->id)
                ->where('status', PreSaleOrderItem::STATUS_PENDING)
                ->whereIn('pre_sale_catalog_id', function ($q) {
                    $q->select('id')
                      ->from('pre_sale_catalogs')
                      ->where('status', PreSaleCatalog::STATUS_ARRIVED);
                })
                ->update([
                    'status'       => PreSaleOrderItem::STATUS_DELIVERED,
                    'delivered_at' => now(),
                ]);

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
                    'notes'             => $notes ?? "Entrega parcial — {$pendingCount} ítem(s) en camino.",
                ]);
            }

            return $order->fresh(['customer', 'items.catalog', 'payments', 'logs']);
        });
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

    private function resolvePickupDeadline(int $orderId): ?string
    {
        return PreSaleOrderItem::where('pre_sale_order_id', $orderId)
            ->join('pre_sale_catalogs', 'pre_sale_catalogs.id', '=', 'pre_sale_order_items.pre_sale_catalog_id')
            ->max('pre_sale_catalogs.pickup_deadline');
    }
}
