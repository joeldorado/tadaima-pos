<?php

namespace App\Services;

use App\Models\CashMovement;
use App\Models\CashRegisterSession;
use App\Models\Inventory;
use App\Models\InventoryMovement;
use App\Models\PreSaleOrder;
use App\Models\PreSaleOrderItem;
use App\Models\PreSaleOrderPayment;
use App\Models\Sale;
use App\Models\SaleCancellation;
use App\Models\SaleItem;
use App\Models\SystemLog;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Support\Facades\DB;

/**
 * ADR-016 — Cancelación de ventas y preventas (edit-in-place + log).
 *
 * Tres modos:
 *  - cancelSaleFull         — anula todo el ticket regular. status='returned'.
 *  - cancelSalePartial      — quita items específicos (qty editable). Sale sigue activa.
 *  - cancelPreSaleOrderFull — anula preventa completa. status='cancelled'.
 *  - rollbackLiquidation    — preventa delivered → ready (revierte solo el pago de liquidación).
 *
 * Invariantes:
 *  - Stock SIEMPRE se restaura (entra a inventory + InventoryMovement type='devolucion').
 *  - Dinero SIEMPRE genera cash_movement type='salida' en la sesión activa.
 *  - Snapshot inmutable de items cancelados (incluye cost_at_sale ADR-015).
 *  - system_logs + sale_cancellations registran el evento.
 */
class SaleCancellationService
{
    /**
     * Cancela una venta regular completa o parcial.
     *
     * @param array<int, array{sale_item_id: int, quantity: float}> $itemsToCancel
     *   Items a cancelar con qty específica. Vacío = cancelación total.
     */
    public function cancelSale(
        Sale $sale,
        array $itemsToCancel,
        string $reasonCode,
        ?string $reasonText,
        User $cancelledBy,
        ?int $activeSessionId,
    ): SaleCancellation {
        if ($sale->cancellation_status === Sale::CANCELLATION_FULL) {
            throw new \DomainException('Esta venta ya fue cancelada por completo.');
        }

        // Regla de negocio (Joel 2026-06-10): ventas pagadas con tarjeta NO se
        // cancelan — la comisión de terminal ya se pagó y la tienda pierde.
        // El reverso de un cobro con tarjeta se maneja fuera del sistema.
        $this->assertNoCardPayments($sale->payments()->with('paymentMethod')->get(), 'venta');

        return DB::transaction(function () use ($sale, $itemsToCancel, $reasonCode, $reasonText, $cancelledBy, $activeSessionId) {
            $sale->load('items.product');

            $isFullCancel = empty($itemsToCancel);
            $itemMap      = $sale->items->keyBy('id');
            $snapshot     = [];
            $amountRefunded = 0.0;

            $itemsToProcess = $isFullCancel
                ? $sale->items->map(fn ($i) => ['sale_item_id' => $i->id, 'quantity' => $i->quantity])->all()
                : $itemsToCancel;

            foreach ($itemsToProcess as $row) {
                /** @var SaleItem|null $item */
                $item = $itemMap->get($row['sale_item_id']);
                if (! $item) {
                    throw new \DomainException("Item {$row['sale_item_id']} no pertenece a la venta #{$sale->id}.");
                }

                $qtyToCancel = (float) $row['quantity'];
                if ($qtyToCancel <= 0) continue;
                if ($qtyToCancel > (float) $item->quantity) {
                    throw new \DomainException("No se puede cancelar {$qtyToCancel} de '{$item->product?->name}': solo quedan {$item->quantity}.");
                }

                $lineTotal = $qtyToCancel * (float) $item->price;
                $amountRefunded += $lineTotal;

                // Snapshot inmutable (preserva cost_at_sale ADR-015 aunque editemos sale_items)
                $snapshot[] = [
                    'sale_item_id'   => $item->id,
                    'product_id'     => $item->product_id,
                    'name'           => $item->product?->name ?? "#{$item->product_id}",
                    'sku'            => $item->product?->sku ?? null,
                    'qty_cancelled'  => $qtyToCancel,
                    'price'          => (float) $item->price,
                    'cost'           => $item->cost !== null ? (float) $item->cost : null,
                    'line_total'     => $lineTotal,
                ];

                // Restaurar stock en bodega de la tienda original.
                $this->restoreInventory($item->product_id, $sale->store_id, $qtyToCancel, $cancelledBy->id, "Cancelación venta #{$sale->id}");

                // Edit-in-place: decrementa qty. Si llega a 0, borra la fila.
                $newQty = (float) $item->quantity - $qtyToCancel;
                if ($newQty <= 0.0001) {
                    $item->delete();
                } else {
                    $item->quantity = $newQty;
                    $item->total    = $newQty * (float) $item->price;
                    $item->save();
                }
            }

            // Recalcular totales de la venta.
            $sale->refresh()->load('items');
            $newSubtotal = (float) $sale->items->sum('total');
            $newTotal    = max(0, $newSubtotal - (float) ($sale->discount ?? 0));

            $sale->subtotal = $newSubtotal;
            $sale->total    = $newTotal;
            $sale->last_cancelled_at = now();

            // Determinar status final.
            $remainingItemsExist = $sale->items->count() > 0;
            if (! $remainingItemsExist || $newTotal <= 0.01) {
                $sale->status              = Sale::STATUS_RETURNED;
                $sale->cancellation_status = Sale::CANCELLATION_FULL;
            } else {
                $sale->cancellation_status = Sale::CANCELLATION_PARTIAL;
            }
            $sale->save();

            // Salida de caja para el reverso de dinero.
            $cashMovement = $this->createRefundCashMovement(
                amount: $amountRefunded,
                description: "Cancelación venta #{$sale->id} · {$reasonCode}",
                sessionId: $activeSessionId,
            );

            // Log inmutable.
            $cancellation = SaleCancellation::create([
                'sale_id'           => $sale->id,
                'mode'              => $isFullCancel || ! $remainingItemsExist
                    ? SaleCancellation::MODE_FULL
                    : SaleCancellation::MODE_PARTIAL_ITEMS,
                'reason_code'       => $reasonCode,
                'reason_text'       => $reasonText,
                'amount_refunded'   => $amountRefunded,
                'cash_movement_id'  => $cashMovement?->id,
                'cash_session_id'   => $activeSessionId,
                'items_snapshot'    => $snapshot,
                'cancelled_by'      => $cancelledBy->id,
                'cancelled_at'      => now(),
            ]);

            SystemLog::write(
                action: 'sale.cancelled',
                description: "Venta #{$sale->id} cancelada ({$cancellation->mode}) · \${$amountRefunded} · {$reasonCode}",
                userId: $cancelledBy->id,
                entityType: 'sale',
                entityId: $sale->id,
                meta: [
                    'mode'             => $cancellation->mode,
                    'reason_code'      => $reasonCode,
                    'amount_refunded'  => $amountRefunded,
                    'items_count'      => count($snapshot),
                    'cash_movement_id' => $cashMovement?->id,
                ],
            );

            return $cancellation;
        });
    }

    /**
     * Cancela una preventa entera o reversa solo la liquidación.
     *
     * Modos:
     *  - 'full'                  → status='cancelled'. Restaura stock si fue entregada. Reversa todos los pagos.
     *  - 'liquidation_rollback'  → status delivered → ready. Reversa SOLO el último payment (la liquidación).
     *                              Stock entregado se devuelve. Items.delivered_at = null.
     */
    public function cancelPreSaleOrder(
        PreSaleOrder $order,
        string $mode,
        string $reasonCode,
        ?string $reasonText,
        User $cancelledBy,
        ?int $activeSessionId,
    ): SaleCancellation {
        if (! in_array($mode, [SaleCancellation::MODE_FULL, SaleCancellation::MODE_LIQUIDATION_ROLLBACK], true)) {
            throw new \DomainException("Modo de cancelación inválido: {$mode}");
        }
        if ($order->status === PreSaleOrder::STATUS_CANCELLED) {
            throw new \DomainException('Esta preventa ya está cancelada.');
        }
        if ($mode === SaleCancellation::MODE_LIQUIDATION_ROLLBACK && $order->status !== PreSaleOrder::STATUS_DELIVERED) {
            throw new \DomainException('Solo se puede revertir la liquidación de una preventa entregada (status=delivered).');
        }

        // Regla de negocio (Joel 2026-06-10): pagos con tarjeta no se reversan.
        // full → revisa TODOS los pagos del folio; rollback → solo el último
        // (la liquidación, que es lo único que se reversa en ese modo).
        $paymentsToCheck = $mode === SaleCancellation::MODE_LIQUIDATION_ROLLBACK
            ? collect([$order->payments()->with('paymentMethod')->orderByDesc('id')->first()])->filter()
            : $order->payments()->with('paymentMethod')->get();
        $this->assertNoCardPayments($paymentsToCheck, 'preventa');

        return DB::transaction(function () use ($order, $mode, $reasonCode, $reasonText, $cancelledBy, $activeSessionId) {
            $order->load(['items.product', 'payments']);
            $wasDelivered = $order->status === PreSaleOrder::STATUS_DELIVERED;

            $snapshot       = [];
            $amountRefunded = 0.0;

            // Snapshot de items siempre (para auditoría aunque no se mueva stock).
            foreach ($order->items as $item) {
                $snapshot[] = [
                    'pre_sale_order_item_id' => $item->id,
                    'product_id'             => $item->product_id,
                    'name'                   => $item->product?->name ?? $order->code,
                    'qty_cancelled'          => (float) $item->quantity,
                    'price'                  => (float) $item->unit_price,
                    'cost'                   => $item->cost !== null ? (float) $item->cost : null,
                    'line_total'             => (float) $item->quantity * (float) $item->unit_price,
                    'was_delivered'          => (bool) ($item->delivered_at ?? null),
                ];

                // Restaura stock SOLO si el item fue entregado (mes movió inventory).
                // Preventa pending/ready no descontó inventory todavía.
                $hadInventory = $wasDelivered && $item->product_id !== null;
                if ($hadInventory) {
                    $this->restoreInventory(
                        productId: (int) $item->product_id,
                        storeId: $order->store_id,
                        quantity: (float) $item->quantity,
                        userId: $cancelledBy->id,
                        notes: "Cancelación preventa {$order->code}",
                    );
                    // Liquidation rollback: marca el item como no entregado.
                    if ($mode === SaleCancellation::MODE_LIQUIDATION_ROLLBACK) {
                        $item->delivered_at = null;
                        $item->status       = PreSaleOrderItem::STATUS_PENDING;
                        $item->save();
                    }
                }
            }

            if ($mode === SaleCancellation::MODE_LIQUIDATION_ROLLBACK) {
                // Reversa SOLO el último payment (la liquidación que se acaba de hacer).
                $lastPayment = $order->payments()->orderByDesc('id')->first();
                if ($lastPayment) {
                    $amountRefunded = (float) $lastPayment->amount;
                    $lastPayment->delete();
                }
                $order->status               = PreSaleOrder::STATUS_READY;
                $order->cancellation_status  = PreSaleOrder::CANCELLATION_PARTIAL;
            } else {
                // FULL: reversa todos los payments y cancela el folio.
                $amountRefunded = (float) $order->payments->sum('amount');
                $order->payments()->delete();
                $order->status               = PreSaleOrder::STATUS_CANCELLED;
                $order->cancellation_status  = PreSaleOrder::CANCELLATION_FULL;
            }
            $order->last_cancelled_at = now();
            $order->save();

            $cashMovement = $amountRefunded > 0
                ? $this->createRefundCashMovement(
                    amount: $amountRefunded,
                    description: "Cancelación preventa {$order->code} · {$mode} · {$reasonCode}",
                    sessionId: $activeSessionId,
                )
                : null;

            $cancellation = SaleCancellation::create([
                'pre_sale_order_id' => $order->id,
                'mode'              => $mode,
                'reason_code'       => $reasonCode,
                'reason_text'       => $reasonText,
                'amount_refunded'   => $amountRefunded,
                'cash_movement_id'  => $cashMovement?->id,
                'cash_session_id'   => $activeSessionId,
                'items_snapshot'    => $snapshot,
                'cancelled_by'      => $cancelledBy->id,
                'cancelled_at'      => now(),
            ]);

            SystemLog::write(
                action: 'pre_sale_order.cancelled',
                description: "Preventa {$order->code} cancelada ({$mode}) · \${$amountRefunded} · {$reasonCode}",
                userId: $cancelledBy->id,
                entityType: 'pre_sale_order',
                entityId: $order->id,
                meta: [
                    'mode'             => $mode,
                    'reason_code'      => $reasonCode,
                    'amount_refunded'  => $amountRefunded,
                    'cash_movement_id' => $cashMovement?->id,
                ],
            );

            return $cancellation;
        });
    }

    /**
     * Restaura stock al inventario. El stock regresa a Exhibición
     * (`type='store'`, de donde se vendió); si por algún motivo no existe, cae
     * a la primera bodega activa de la tienda (defensa).
     */
    private function restoreInventory(int $productId, ?int $storeId, float $quantity, int $userId, string $notes): void
    {
        if ($storeId === null) return; // venta sin tienda no debería pasar, defensa

        $warehouse = Warehouse::query()
            ->where('store_id', $storeId)
            ->where('active', true)
            // Preferir Exhibición (type='store') — el stock vuelve al front.
            ->orderByRaw("CASE WHEN type = 'store' THEN 0 ELSE 1 END")
            ->orderBy('id')
            ->first();
        if (! $warehouse) {
            // No hay bodega — log y salir. Mejor que romper.
            SystemLog::write(
                action: 'inventory.restore_failed',
                description: "No hay bodega activa para store_id={$storeId} al restaurar producto {$productId}",
                userId: $userId,
                entityType: 'product',
                entityId: $productId,
                meta: ['quantity' => $quantity, 'reason' => $notes],
            );
            return;
        }

        $inventory = Inventory::firstOrCreate(
            ['product_id' => $productId, 'warehouse_id' => $warehouse->id],
            ['quantity' => 0],
        );
        $inventory->quantity = (float) $inventory->quantity + $quantity;
        $inventory->save();

        InventoryMovement::create([
            'product_id'   => $productId,
            'warehouse_id' => $warehouse->id,
            'type'         => 'devolucion',
            'quantity'     => $quantity,
            'notes'        => $notes,
            'user_id'      => $userId,
        ]);
    }

    /**
     * Bloquea la cancelación si algún pago de la colección fue con tarjeta.
     *
     * @param \Illuminate\Support\Collection $payments pagos con paymentMethod cargado
     * @throws \DomainException
     */
    private function assertNoCardPayments($payments, string $entidad): void
    {
        foreach ($payments as $payment) {
            if ($payment->paymentMethod?->isCard()) {
                throw new \DomainException(
                    "No se puede cancelar: esta {$entidad} tiene un pago con tarjeta ({$payment->paymentMethod->name}). " .
                    'Las cancelaciones con tarjeta no están permitidas.'
                );
            }
        }
    }

    /**
     * Salida de caja por reverso de dinero. Asociada a la sesión activa al
     * momento de la cancelación (no a la sesión original de la venta).
     */
    private function createRefundCashMovement(float $amount, string $description, ?int $sessionId): ?CashMovement
    {
        if ($amount <= 0 || $sessionId === null) return null;
        $session = CashRegisterSession::find($sessionId);
        if (! $session) return null;

        return CashMovement::create([
            'register_session_id' => $sessionId,
            'type'                => 'salida',
            'amount'              => $amount,
            'description'         => $description,
        ]);
    }
}
