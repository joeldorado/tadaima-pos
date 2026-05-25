<?php

namespace App\Services;

use App\Models\CustomerCredit;
use App\Models\Inventory;
use App\Models\InventoryMovement;
use App\Models\Layaway;
use App\Models\LayawayLog;
use App\Models\LayawayPayment;
use App\Models\ProductPrice;
use App\Models\Sale;
use App\Models\SaleItem;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class LayawayService
{
    // ─── Create ───────────────────────────────────────────────────────────────

    /**
     * Creates a Layaway, reserves inventory, and records the down payment.
     *
     * Flow (single DB::transaction):
     *  1. Generate unique code AP-YYYYMM-XXXX
     *  2. Resolve price (from catalog if not supplied)
     *  3. Validate stock with lockForUpdate
     *  4. Create Layaway (status = active)
     *  5. Decrement inventory → InventoryMovement type=apartado
     *  6. Record down_payment as LayawayPayment
     *  7. Log creation
     *
     * @throws \DomainException on insufficient stock or missing price
     */
    public function create(array $data, int $userId): Layaway
    {
        return DB::transaction(function () use ($data, $userId) {
            $productId = (int) $data['product_id'];
            $quantity  = (int) ($data['quantity'] ?? 1);
            $price     = isset($data['price'])
                ? (float) $data['price']
                : $this->resolvePrice($productId);

            $total = round($price * $quantity, 2);

            // ── Lock inventory ────────────────────────────────────────────────
            $inventory = $this->lockInventory($productId, $quantity, $data['store_id'] ?? null, $data['warehouse_id'] ?? null);

            // Snap del cost del producto al momento de crear el apartado.
            // El apartado descuenta inventario al crearse, así que ese es el
            // momento contable. Cuando se entregue (deliver), el SaleItem
            // hereda este cost — no se re-snap.
            $snappedCost = \App\Models\Product::whereKey($productId)->value('cost');

            // ── Create layaway ────────────────────────────────────────────────
            $layaway = Layaway::create([
                'code'         => $this->generateCode(),
                'store_id'     => $data['store_id'],
                'user_id'      => $userId,
                'customer_id'  => $data['customer_id'],
                'product_id'   => $productId,
                'warehouse_id' => $inventory->warehouse_id,
                'quantity'     => $quantity,
                'price'        => $price,
                'total'        => $total,
                'cost'         => $snappedCost !== null ? (float) $snappedCost : null,
                'down_payment' => (float) $data['down_payment'],
                'status'       => Layaway::STATUS_ACTIVE,
                'expires_at'   => $data['expires_at'] ?? null,
                'notes'        => $data['notes'] ?? null,
            ]);

            // ── Reserve inventory ─────────────────────────────────────────────
            $inventory->decrement('quantity', $quantity);

            InventoryMovement::create([
                'product_id'   => $productId,
                'warehouse_id' => $inventory->warehouse_id,
                'type'         => 'apartado',
                'quantity'     => $quantity,
                'reference'    => "APARTADO-{$layaway->id}",
                'notes'        => null,
                'user_id'      => $userId,
            ]);

            // ── Record down payment ───────────────────────────────────────────
            LayawayPayment::create([
                'layaway_id'        => $layaway->id,
                'amount'            => (float) $data['down_payment'],
                'payment_method_id' => $data['payment_method_id'] ?? null,
                'notes'             => 'Anticipo inicial',
            ]);

            LayawayLog::create([
                'layaway_id' => $layaway->id,
                'action'     => 'created',
                'user_id'    => $userId,
                'notes'      => "Anticipo: \${$data['down_payment']}",
            ]);

            return $layaway->load(['product', 'customer', 'payments', 'logs']);
        });
    }

    // ─── Add payment ──────────────────────────────────────────────────────────

    /**
     * Records an additional payment (abono).
     * Auto-transitions to 'paid' when balance reaches 0.
     *
     * @throws \DomainException on invalid status or overpayment
     */
    public function addPayment(Layaway $layaway, array $data, int $userId): LayawayPayment
    {
        return DB::transaction(function () use ($layaway, $data, $userId) {
            $layaway = Layaway::lockForUpdate()->find($layaway->id);

            if ($layaway->status !== Layaway::STATUS_ACTIVE) {
                throw new \DomainException(
                    "El apartado #{$layaway->code} no está activo (estado: {$layaway->status})."
                );
            }

            $layaway->load('payments');
            $amount  = round((float) $data['amount'], 2);
            $balance = $layaway->balance;

            if ($amount > $balance + 0.01) {
                throw new \DomainException(
                    "El abono ({$amount}) supera el saldo pendiente ({$balance})."
                );
            }

            $payment = LayawayPayment::create([
                'layaway_id'        => $layaway->id,
                'amount'            => $amount,
                'payment_method_id' => $data['payment_method_id'] ?? null,
                'notes'             => $data['notes'] ?? null,
            ]);

            LayawayLog::create([
                'layaway_id' => $layaway->id,
                'action'     => 'payment_added',
                'user_id'    => $userId,
                'notes'      => "Abono \${$amount}",
            ]);

            // ── Auto-transition to paid ───────────────────────────────────────
            $newBalance = round($balance - $amount, 2);
            if ($newBalance <= 0.01) {
                $layaway->update(['status' => Layaway::STATUS_PAID]);

                LayawayLog::create([
                    'layaway_id' => $layaway->id,
                    'action'     => 'paid',
                    'user_id'    => $userId,
                    'notes'      => 'Saldo liquidado — apartado marcado como pagado.',
                ]);
            }

            return $payment->load('paymentMethod');
        });
    }

    // ─── Deliver → generate real Sale ────────────────────────────────────────

    /**
     * Converts a paid layaway into a real Sale.
     *
     * @throws \DomainException if status is not 'paid'
     */
    public function deliver(Layaway $layaway, int $userId): Sale
    {
        return DB::transaction(function () use ($layaway, $userId) {
            $layaway = Layaway::lockForUpdate()->find($layaway->id);

            if ($layaway->status !== Layaway::STATUS_PAID) {
                throw new \DomainException(
                    "El apartado #{$layaway->code} no está liquidado (estado: {$layaway->status})."
                );
            }

            $sale = Sale::create([
                'store_id'          => $layaway->store_id,
                'user_id'           => $userId,
                'customer_id'       => $layaway->customer_id,
                'subtotal'          => $layaway->total,
                'discount'          => 0,
                'total'             => $layaway->total,
                'commission_amount' => 0,
                'status'            => Sale::STATUS_COMPLETED,
            ]);

            // El SaleItem hereda `cost` del Layaway (snapped al crear el
            // apartado). NO se lee `products.cost` actual — el apartado fijó
            // el costo cuando reservó el inventario, esa es la verdad
            // contable. Si el cost del producto cambió entre apartar y
            // entregar, la ganancia del apartado sigue siendo la del momento
            // de la reservación, no la del momento de la entrega.
            SaleItem::create([
                'sale_id'    => $sale->id,
                'product_id' => $layaway->product_id,
                'manga_id'   => null,
                'quantity'   => $layaway->quantity,
                'price'      => $layaway->price,
                'total'      => $layaway->total,
                'cost'       => $layaway->cost,
            ]);

            $layaway->update(['status' => Layaway::STATUS_DELIVERED]);

            LayawayLog::create([
                'layaway_id' => $layaway->id,
                'action'     => 'delivered',
                'user_id'    => $userId,
                'notes'      => "Venta #{$sale->id} generada.",
            ]);

            return $sale->load(['items.product', 'customer']);
        });
    }

    // ─── Cancel → release inventory ───────────────────────────────────────────

    /**
     * Cancels the layaway and releases reserved inventory.
     * Credits all paid amounts back to the customer.
     *
     * @throws \DomainException if status is not active or paid
     */
    public function cancel(Layaway $layaway, int $userId, ?string $notes = null): Layaway
    {
        return DB::transaction(function () use ($layaway, $userId, $notes) {
            $layaway = Layaway::lockForUpdate()->find($layaway->id);

            if (! in_array($layaway->status, Layaway::OPEN_STATUSES)) {
                throw new \DomainException(
                    "El apartado #{$layaway->code} no puede cancelarse (estado: {$layaway->status})."
                );
            }

            $layaway->load('payments');

            // ── Restore inventory ─────────────────────────────────────────────
            $original = InventoryMovement::where('reference', "APARTADO-{$layaway->id}")
                ->where('type', 'apartado')
                ->first();

            $warehouseId = $original?->warehouse_id ?? $layaway->warehouse_id;

            if ($warehouseId) {
                $inventory = Inventory::lockForUpdate()
                    ->where('product_id', $layaway->product_id)
                    ->where('warehouse_id', $warehouseId)
                    ->first();

                if ($inventory) {
                    $inventory->increment('quantity', $layaway->quantity);
                }

                InventoryMovement::create([
                    'product_id'   => $layaway->product_id,
                    'warehouse_id' => $warehouseId,
                    'type'         => 'apartado_cancelado',
                    'quantity'     => $layaway->quantity,
                    'reference'    => "APARTADO-CANCELADO-{$layaway->id}",
                    'notes'        => null,
                    'user_id'      => $userId,
                ]);
            }

            // ── Credit paid amount to customer ────────────────────────────────
            $paidAmount = $layaway->paid_amount;
            if ($paidAmount > 0.01 && $layaway->customer_id) {
                CustomerCredit::create([
                    'customer_id' => $layaway->customer_id,
                    'amount'      => $paidAmount,
                    'reason'      => "Cancelación apartado #{$layaway->code}",
                ]);
            }

            $layaway->update(['status' => Layaway::STATUS_CANCELLED]);

            LayawayLog::create([
                'layaway_id' => $layaway->id,
                'action'     => 'cancelled',
                'user_id'    => $userId,
                'notes'      => $notes,
            ]);

            return $layaway->fresh(['product', 'customer', 'payments.paymentMethod', 'logs']);
        });
    }

    // ─── Private helpers ──────────────────────────────────────────────────────

    /**
     * Finds inventory with enough stock, preferring the store's warehouse.
     *
     * @throws \DomainException on insufficient stock
     */
    private function lockInventory(int $productId, int $quantity, ?int $storeId, ?int $warehouseId): \App\Models\Inventory
    {
        // If specific warehouse requested, use it
        if ($warehouseId) {
            $inventory = Inventory::lockForUpdate()
                ->where('product_id', $productId)
                ->where('warehouse_id', $warehouseId)
                ->where('quantity', '>=', $quantity)
                ->first();

            if ($inventory) {
                return $inventory;
            }
        }

        // Prefer store-linked warehouse
        if ($storeId) {
            $inventory = Inventory::lockForUpdate()
                ->where('product_id', $productId)
                ->where('quantity', '>=', $quantity)
                ->whereHas('warehouse', fn ($q) => $q->where('store_id', $storeId)->where('active', true))
                ->orderByDesc('quantity')
                ->first();

            if ($inventory) {
                return $inventory;
            }
        }

        // Fallback: any warehouse with enough stock
        $inventory = Inventory::lockForUpdate()
            ->where('product_id', $productId)
            ->where('quantity', '>=', $quantity)
            ->orderByDesc('quantity')
            ->first();

        if (! $inventory) {
            $product   = \App\Models\Product::find($productId);
            $name      = $product?->name ?? "producto ID:{$productId}";
            $available = (float) Inventory::where('product_id', $productId)->sum('quantity');

            throw new \DomainException(
                "Stock insuficiente para '{$name}'. Disponible: {$available}, solicitado: {$quantity}."
            );
        }

        return $inventory;
    }

    private function resolvePrice(int $productId): float
    {
        $price = ProductPrice::where('product_id', $productId)->value('price_1');

        if ($price === null) {
            throw new \DomainException(
                "No se encontró precio para producto ID:{$productId}. Envía el precio manualmente."
            );
        }

        return (float) $price;
    }

    private function generateCode(): string
    {
        do {
            $code = 'AP-' . now()->format('Ym') . '-' . strtoupper(Str::random(4));
        } while (Layaway::where('code', $code)->exists());

        return $code;
    }
}
