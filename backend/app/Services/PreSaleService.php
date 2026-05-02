<?php

namespace App\Services;

use App\Models\CustomerCredit;
use App\Services\PointsService;
use App\Models\Inventory;
use App\Models\InventoryMovement;
use App\Models\PreSale;
use App\Models\PreSaleItem;
use App\Models\PreSaleLog;
use App\Models\PreSalePayment;
use App\Models\Product;
use App\Models\ProductPrice;
use App\Models\Sale;
use App\Models\SaleItem;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class PreSaleService
{
    public function __construct(private readonly PointsService $pointsService) {}

    // ─── Create ───────────────────────────────────────────────────────────────

    /**
     * Creates a PreSale, its items, and reserves inventory.
     *
     * Flow (single DB::transaction):
     *  1. Generate unique code
     *  2. Create PreSale
     *  3. Create PreSaleItems (resolve prices from catalog if not provided)
     *  4. lockForUpdate + decrement inventory → InventoryMovement type=preventa
     *  5. Log: created
     *
     * @throws \DomainException on insufficient stock or missing price
     */
    public function create(array $data, array $itemsData, int $userId): PreSale
    {
        return DB::transaction(function () use ($data, $itemsData, $userId) {
            $data['code']    = $this->generateCode();
            $data['user_id'] = $userId;
            $data['status']  = PreSale::STATUS_LIVE;

            $preSale = PreSale::create($data);

            foreach ($itemsData as $itemData) {
                $price = isset($itemData['price'])
                    ? (float) $itemData['price']
                    : $this->resolvePrice($itemData['product_id'] ?? null, $itemData['price_level'] ?? 1);

                PreSaleItem::create([
                    'pre_sale_id' => $preSale->id,
                    'product_id'  => $itemData['product_id'] ?? null,
                    'manga_id'    => $itemData['manga_id'] ?? null,
                    'quantity'    => $itemData['quantity'],
                    'price_level' => $itemData['price_level'] ?? 1,
                    'price'       => $price,
                ]);
            }

            $preSale->load('items.product');
            $this->reserveInventory($preSale, $userId);

            PreSaleLog::create([
                'pre_sale_id' => $preSale->id,
                'action'      => 'created',
                'user_id'     => $userId,
                'notes'       => null,
            ]);

            return $preSale->load(['items.product', 'payments', 'logs', 'customer']);
        });
    }

    // ─── Update metadata ──────────────────────────────────────────────────────

    /**
     * Updates editable fields on an active PreSale.
     * Items and inventory are NOT modified here — only header fields.
     *
     * @throws \DomainException if not in active status
     */
    public function update(PreSale $preSale, array $data, int $userId): PreSale
    {
        if (! in_array($preSale->status, PreSale::EDITABLE_STATUSES)) {
            throw new \DomainException(
                "No se puede editar la preventa #{$preSale->id} (estado: {$preSale->status})."
            );
        }

        // Only allow manual status transitions between live and paused
        if (isset($data['status'])) {
            $allowed = [PreSale::STATUS_LIVE, PreSale::STATUS_PAUSED];
            if (! in_array($data['status'], $allowed)) {
                unset($data['status']);
            }
        }

        $preSale->update($data);

        PreSaleLog::create([
            'pre_sale_id' => $preSale->id,
            'action'      => 'updated',
            'user_id'     => $userId,
            'notes'       => null,
        ]);

        return $preSale->fresh(['items.product', 'payments.paymentMethod', 'logs', 'customer']);
    }

    // ─── Status change (live ↔ ready) ─────────────────────────────────────────

    /**
     * Handles manual status transitions: live ↔ ready.
     * Complete and cancel are handled by their own methods.
     *
     * @throws \DomainException on invalid transition
     */
    public function changeStatus(PreSale $preSale, string $newStatus, int $userId, ?string $notes = null): PreSale
    {
        $transitions = [
            PreSale::STATUS_LIVE  => [PreSale::STATUS_READY],
            PreSale::STATUS_READY => [PreSale::STATUS_LIVE],
        ];

        if (! in_array($newStatus, $transitions[$preSale->status] ?? [])) {
            throw new \DomainException(
                "Transición inválida: {$preSale->status} → {$newStatus}. " .
                'Usa el endpoint de completar o cancelar para esas acciones.'
            );
        }

        $preSale->update(['status' => $newStatus]);

        PreSaleLog::create([
            'pre_sale_id' => $preSale->id,
            'action'      => "status_{$newStatus}",
            'user_id'     => $userId,
            'notes'       => $notes,
        ]);

        return $preSale->fresh(['items.product', 'payments.paymentMethod', 'logs', 'customer']);
    }

    // ─── Add payment ──────────────────────────────────────────────────────────

    /**
     * Records an advance payment (abono) against the PreSale.
     * Amount cannot exceed the remaining balance.
     *
     * @throws \DomainException on inactive status or overpayment
     */
    public function addPayment(PreSale $preSale, array $paymentData, int $userId): PreSalePayment
    {
        return DB::transaction(function () use ($preSale, $paymentData, $userId) {
            // Lock to prevent race conditions between concurrent payments
            $preSale = PreSale::lockForUpdate()->find($preSale->id);

            if (! in_array($preSale->status, PreSale::ACTIVE_STATUSES)) {
                throw new \DomainException(
                    "La preventa #{$preSale->id} no está activa (estado: {$preSale->status})."
                );
            }

            $preSale->load('items', 'payments');
            $amount  = round((float) $paymentData['amount'], 2);
            $balance = $preSale->balance;

            if ($amount > $balance + 0.01) {
                throw new \DomainException(
                    "El abono ({$amount}) supera el saldo pendiente ({$balance})."
                );
            }

            $payment = PreSalePayment::create([
                'pre_sale_id'       => $preSale->id,
                'amount'            => $amount,
                'payment_method_id' => $paymentData['payment_method_id'] ?? null,
                'notes'             => $paymentData['notes'] ?? null,
            ]);

            $suffix = ! empty($paymentData['notes']) ? ": {$paymentData['notes']}" : '';
            PreSaleLog::create([
                'pre_sale_id' => $preSale->id,
                'action'      => 'payment_added',
                'user_id'     => $userId,
                'notes'       => "Abono \${$amount}{$suffix}",
            ]);

            return $payment->load('paymentMethod');
        });
    }

    // ─── Complete → convert to Sale ───────────────────────────────────────────

    /**
     * Completes the PreSale, generating a real Sale.
     *
     * Flow (single DB::transaction):
     *  1. lockForUpdate on PreSale, validate active
     *  2. Validate fully paid (paid_amount >= total ± 0.01)
     *  3. Create Sale + SaleItems (inventory was already reserved at creation)
     *  4. Credit overpayment to customer (if any)
     *  5. Mark PreSale as completed
     *  6. Log: completed
     *
     * @throws \DomainException on invalid state or insufficient payment
     */
    public function complete(PreSale $preSale, int $userId): Sale
    {
        return DB::transaction(function () use ($preSale, $userId) {
            $preSale = PreSale::lockForUpdate()->find($preSale->id);

            if (! in_array($preSale->status, PreSale::ACTIVE_STATUSES)) {
                throw new \DomainException(
                    "La preventa #{$preSale->id} no se puede completar (estado: {$preSale->status})."
                );
            }

            $preSale->load('items.product', 'payments');

            $total      = $preSale->total;
            $paidAmount = $preSale->paid_amount;

            if ($paidAmount < $total - 0.01) {
                $pending = round($total - $paidAmount, 2);
                throw new \DomainException(
                    "Pago insuficiente. Total: \${$total}, Pagado: \${$paidAmount}, Pendiente: \${$pending}."
                );
            }

            if (! $preSale->store_id) {
                throw new \DomainException(
                    "La preventa #{$preSale->code} no tiene tienda asignada. Edítala y asigna una tienda antes de completarla."
                );
            }

            // ── Create Sale ───────────────────────────────────────────────────
            $sale = Sale::create([
                'store_id'          => $preSale->store_id,
                'user_id'           => $userId,
                'customer_id'       => $preSale->customer_id,
                'subtotal'          => $total,
                'discount'          => 0,
                'total'             => $total,
                'commission_amount' => 0,
                'status'            => Sale::STATUS_COMPLETED,
            ]);

            // ── Create SaleItems (inventory already decremented at preventa creation) ──
            foreach ($preSale->items as $item) {
                SaleItem::create([
                    'sale_id'    => $sale->id,
                    'product_id' => $item->product_id,
                    'manga_id'   => $item->manga_id,
                    'quantity'   => $item->quantity,
                    'price'      => $item->price,
                    'total'      => round($item->quantity * $item->price, 2),
                ]);
            }

            // ── Credit any overpayment ────────────────────────────────────────
            $overpayment = round($paidAmount - $total, 2);
            if ($overpayment > 0.01 && $preSale->customer_id) {
                CustomerCredit::create([
                    'customer_id' => $preSale->customer_id,
                    'amount'      => $overpayment,
                    'reason'      => "Sobrepago preventa #{$preSale->code}",
                ]);
            }

            $preSale->update(['status' => PreSale::STATUS_COMPLETED, 'linked_sale_id' => $sale->id]);

            PreSaleLog::create([
                'pre_sale_id' => $preSale->id,
                'action'      => 'completed',
                'user_id'     => $userId,
                'notes'       => "Venta #{$sale->id} generada.",
            ]);

            // Award loyalty points to customer
            if ($preSale->customer_id && $total > 0) {
                $this->pointsService->award(
                    customerId:    $preSale->customer_id,
                    amount:        $total,
                    reason:        "Preventa #{$preSale->code} completada",
                    referenceType: 'pre_sale',
                    referenceId:   $preSale->id,
                );
            }

            return $sale->load(['items.product', 'payments.paymentMethod', 'customer']);
        });
    }

    // ─── Cancel → release inventory ───────────────────────────────────────────

    /**
     * Cancels the PreSale.
     *
     * Flow (single DB::transaction):
     *  1. lockForUpdate on PreSale, validate active
     *  2. Release reserved inventory → InventoryMovement type=preventa_cancelada
     *  3. Credit paid amounts to customer (saldo a favor)
     *  4. Mark PreSale as cancelled
     *  5. Log: cancelled
     *
     * @throws \DomainException on invalid state
     */
    public function cancel(PreSale $preSale, int $userId, ?string $notes = null): PreSale
    {
        return DB::transaction(function () use ($preSale, $userId, $notes) {
            $preSale = PreSale::lockForUpdate()->find($preSale->id);

            if (! in_array($preSale->status, PreSale::ACTIVE_STATUSES)) {
                throw new \DomainException(
                    "La preventa #{$preSale->id} no puede cancelarse (estado: {$preSale->status})."
                );
            }

            $preSale->load('items.product', 'payments');

            // ── Release reserved inventory ────────────────────────────────────
            $this->releaseInventory($preSale, $userId);

            // ── Credit paid amount to customer ────────────────────────────────
            $paidAmount = $preSale->paid_amount;
            if ($paidAmount > 0.01 && $preSale->customer_id) {
                CustomerCredit::create([
                    'customer_id' => $preSale->customer_id,
                    'amount'      => $paidAmount,
                    'reason'      => "Cancelación preventa #{$preSale->code}",
                ]);
            }

            $preSale->update(['status' => PreSale::STATUS_CANCELLED]);

            PreSaleLog::create([
                'pre_sale_id' => $preSale->id,
                'action'      => 'cancelled',
                'user_id'     => $userId,
                'notes'       => $notes,
            ]);

            return $preSale->fresh(['items.product', 'payments.paymentMethod', 'logs', 'customer']);
        });
    }

    // ─── Create product from pre-sale ────────────────────────────────────────

    /**
     * Creates a real Product with prices and inventory from pre-sale data.
     * Admin supplies the missing fields (sku, price_1, warehouse_quantities).
     *
     * @return array{pre_sale: PreSale, product_id: int}
     * @throws \DomainException if already pushed
     */
    public function createProductFromPreSale(PreSale $preSale, array $data, int $userId): array
    {
        return DB::transaction(function () use ($preSale, $data, $userId) {
            $product = Product::create([
                'name'        => $data['name'] ?? $preSale->product_name,
                'sku'         => $data['sku'],
                'cost'        => $data['cost'] ?? $preSale->cost ?? 0,
                'category_id' => $data['category_id'] ?? $preSale->category_id ?? null,
                'active'      => true,
            ]);

            ProductPrice::create([
                'product_id' => $product->id,
                'price_1'    => $data['price_1'],
                'price_2'    => $data['price_2'] ?? null,
                'price_3'    => $data['price_3'] ?? null,
                'price_4'    => $data['price_4'] ?? null,
                'price_5'    => $data['price_5'] ?? null,
            ]);

            foreach ($data['warehouse_quantities'] as $wq) {
                if ($wq['quantity'] <= 0) continue;

                $inventory = Inventory::firstOrNew([
                    'product_id'   => $product->id,
                    'warehouse_id' => $wq['warehouse_id'],
                ]);
                $inventory->quantity = ($inventory->quantity ?? 0) + $wq['quantity'];
                $inventory->save();

                InventoryMovement::create([
                    'product_id'   => $product->id,
                    'warehouse_id' => $wq['warehouse_id'],
                    'type'         => 'entrada',
                    'quantity'     => $wq['quantity'],
                    'reference'    => "PREVENTA-PRODUCTO-{$preSale->id}",
                    'notes'        => "Alta desde preventa #{$preSale->code}",
                    'user_id'      => $userId,
                ]);
            }

            $preSale->update(['inventory_pushed' => true, 'product_id' => $product->id]);

            PreSaleLog::create([
                'pre_sale_id' => $preSale->id,
                'action'      => 'product_created',
                'user_id'     => $userId,
                'notes'       => "Producto #{$product->id} creado (SKU: {$product->sku}).",
            ]);

            return [
                'pre_sale'   => $preSale->fresh(['items.product', 'payments.paymentMethod', 'logs', 'customer']),
                'product_id' => $product->id,
            ];
        });
    }

    // ─── Expire → move stock to real inventory ────────────────────────────────

    /**
     * Marks the pre-sale as expired and moves reserved stock to real inventory.
     *
     * @throws \DomainException on invalid state
     */
    public function expireToInventory(PreSale $preSale, int $warehouseId, int $userId): PreSale
    {
        return DB::transaction(function () use ($preSale, $warehouseId, $userId) {
            $preSale = PreSale::lockForUpdate()->find($preSale->id);
            $preSale->load('items.product');

            foreach ($preSale->items as $item) {
                if (! $item->product_id) continue;

                $inventory = Inventory::lockForUpdate()
                    ->where('product_id', $item->product_id)
                    ->where('warehouse_id', $warehouseId)
                    ->first();

                if ($inventory) {
                    $inventory->increment('quantity', $item->quantity);
                } else {
                    Inventory::create([
                        'product_id'   => $item->product_id,
                        'warehouse_id' => $warehouseId,
                        'quantity'     => $item->quantity,
                    ]);
                }

                InventoryMovement::create([
                    'product_id'   => $item->product_id,
                    'warehouse_id' => $warehouseId,
                    'type'         => 'entrada',
                    'quantity'     => $item->quantity,
                    'reference'    => "PREVENTA-EXPIRADA-{$preSale->id}",
                    'notes'        => "Stock de preventa vencida #{$preSale->code} movido a inventario.",
                    'user_id'      => $userId,
                ]);
            }

            $preSale->update(['status' => PreSale::STATUS_EXPIRED]);

            PreSaleLog::create([
                'pre_sale_id' => $preSale->id,
                'action'      => 'expired_to_inventory',
                'user_id'     => $userId,
                'notes'       => "Stock movido a bodega ID:{$warehouseId}.",
            ]);

            return $preSale->fresh(['items.product', 'payments.paymentMethod', 'logs', 'customer']);
        });
    }

    // ─── Private helpers ──────────────────────────────────────────────────────

    /**
     * Decrements inventory for each item and records InventoryMovements (type=preventa).
     * Prefers store-linked warehouse, falls back to any warehouse with sufficient stock.
     *
     * @throws \DomainException on insufficient stock
     */
    private function reserveInventory(PreSale $preSale, int $userId): void
    {
        foreach ($preSale->items as $item) {
            if (! $item->product_id) {
                continue; // free-text items (no product linked) don't touch inventory
            }

            $inventory = Inventory::lockForUpdate()
                ->where('product_id', $item->product_id)
                ->where('quantity', '>=', $item->quantity)
                ->whereHas('warehouse', fn ($q) => $q
                    ->where('store_id', $preSale->store_id)
                    ->where('active', true)
                )
                ->orderByDesc('quantity')
                ->first();

            // Fallback: any warehouse with sufficient stock
            $inventory ??= Inventory::lockForUpdate()
                ->where('product_id', $item->product_id)
                ->where('quantity', '>=', $item->quantity)
                ->orderByDesc('quantity')
                ->first();

            if (! $inventory) {
                $name      = $item->product?->name ?? "producto ID:{$item->product_id}";
                $available = (float) Inventory::where('product_id', $item->product_id)->sum('quantity');
                throw new \DomainException(
                    "Stock insuficiente para '{$name}'. Disponible: {$available}, solicitado: {$item->quantity}."
                );
            }

            $inventory->decrement('quantity', $item->quantity);

            InventoryMovement::create([
                'product_id'   => $item->product_id,
                'warehouse_id' => $inventory->warehouse_id,
                'type'         => 'preventa',
                'quantity'     => $item->quantity,
                'reference'    => "PREVENTA-{$preSale->id}",
                'notes'        => null,
                'user_id'      => $userId,
            ]);
        }
    }

    /**
     * Restores inventory reserved by this PreSale.
     * Looks up the original InventoryMovement to find the correct warehouse.
     */
    private function releaseInventory(PreSale $preSale, int $userId): void
    {
        // Map product_id → original movement to know which warehouse was used
        $original = InventoryMovement::where('reference', "PREVENTA-{$preSale->id}")
            ->where('type', 'preventa')
            ->get()
            ->keyBy('product_id');

        foreach ($preSale->items as $item) {
            if (! $item->product_id) {
                continue;
            }

            $movement = $original[$item->product_id] ?? null;
            if (! $movement) {
                continue; // no reservation found — skip silently
            }

            $inventory = Inventory::lockForUpdate()
                ->where('product_id', $item->product_id)
                ->where('warehouse_id', $movement->warehouse_id)
                ->first();

            if ($inventory) {
                $inventory->increment('quantity', $item->quantity);
            }

            InventoryMovement::create([
                'product_id'   => $item->product_id,
                'warehouse_id' => $movement->warehouse_id,
                'type'         => 'preventa_cancelada',
                'quantity'     => $item->quantity,
                'reference'    => "PREVENTA-CANCELADA-{$preSale->id}",
                'notes'        => null,
                'user_id'      => $userId,
            ]);
        }
    }

    /**
     * Generates a unique pre-sale code: PS-YYYYMM-XXXX
     */
    private function generateCode(): string
    {
        do {
            $code = 'PS-' . now()->format('Ym') . '-' . strtoupper(Str::random(4));
        } while (PreSale::where('code', $code)->exists());

        return $code;
    }

    /**
     * Resolves price from catalog (price_1..price_5) when not provided in the request.
     *
     * @throws \DomainException when product has no price configured at that level
     */
    private function resolvePrice(?int $productId, int $level = 1): float
    {
        if (! $productId) {
            throw new \DomainException(
                'Se requiere precio o product_id para calcular el precio del ítem.'
            );
        }

        $column = 'price_' . max(1, min(5, $level));
        $price  = ProductPrice::where('product_id', $productId)->value($column);

        if ($price === null) {
            throw new \DomainException(
                "No se encontró precio nivel {$level} para producto ID:{$productId}. Envía el precio manualmente."
            );
        }

        return (float) $price;
    }
}
