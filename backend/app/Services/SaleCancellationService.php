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
 *  - Del cajón sale solo la porción COBRADA EN EFECTIVO (cash_movement
 *    type='salida' en la sesión activa); lo de tarjeta/transferencia se
 *    devuelve por la terminal o el banco, fuera del sistema.
 *  - Se devuelve lo COBRADO (neto: bruto − descuento + aumento, prorrateados
 *    por cantidad) = total antes − total después (2026-09-29).
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
        return DB::transaction(function () use ($sale, $itemsToCancel, $reasonCode, $reasonText, $cancelledBy, $activeSessionId) {
            // Lock de la venta: los pagos y el cashRatio se leen DENTRO de la
            // transacción para no cruzarse con una corrección de método de pago
            // (PUT /sales/{id}/payments) que se confirme a media cancelación.
            $sale = Sale::lockForUpdate()->findOrFail($sale->id);
            if ($sale->cancellation_status === Sale::CANCELLATION_FULL) {
                throw new \DomainException('Esta venta ya fue cancelada por completo.');
            }

            // Ventas con tarjeta SÍ se cancelan desde 2026-09-30 (decisión Joel; antes
            // bloqueado desde 2026-06-10): regresa el stock y queda el registro, pero
            // no sale efectivo del cajón (cashRatio = 0) — la devolución al cliente se
            // hace en la terminal y la comisión ya pagada queda como gasto de la
            // tienda. Las PREVENTAS con tarjeta siguen bloqueadas (cancelPreSaleOrder).
            $payments = $sale->payments()->with('paymentMethod')->get();

            // Pago mixto (2026-08-05): del cajón solo sale la porción pagada con
            // métodos cash-like — lo transferido nunca entró al cajón, así que su
            // reverso va por el banco. Sin pagos registrados (legacy) o método
            // borrado, ratio 1 conserva el comportamiento histórico.
            $totalPaid = (float) $payments->sum('amount');
            $cashPaid  = (float) $payments
                ->filter(fn ($p) => $p->paymentMethod?->isCashLike() ?? true)
                ->sum('amount');
            $cashRatio = $totalPaid > 0 ? $cashPaid / $totalPaid : 1.0;

            $sale->load('items.product');

            $isFullCancel = empty($itemsToCancel);
            $itemMap      = $sale->items->keyBy('id');
            $snapshot     = [];

            // Reembolso NETO (2026-09-29): se devuelve exactamente lo que la
            // venta deja de cobrar (total antes − total después). Antes se
            // devolvía cantidad × precio aunque la línea tuviera descuento
            // (devolvía de más, el corte quedaba corto); con aumentos sería al
            // revés. Invariante: total final + Σ reembolsos = Σ pagos.
            $totalBefore  = round((float) $sale->total, 2);
            $runSubtotal  = round((float) $sale->items->sum('total'), 2);
            $runDiscount  = round((float) ($sale->discount ?? 0), 2);
            $runSurcharge = round((float) ($sale->surcharge ?? 0), 2);
            // Legacy (antes de Descuentos v2): descuento global sin montos por
            // línea → se prorratea por bruto.
            $isLegacy = $runDiscount > 0.005 && $sale->items->every(
                fn (SaleItem $i) => (float) $i->discount_amount <= 0.005 && (float) ($i->surcharge_amount ?? 0) <= 0.005,
            );

            $itemsToProcess = $isFullCancel
                ? $sale->items->map(fn ($i) => ['sale_item_id' => $i->id, 'quantity' => $i->quantity])->all()
                : $itemsToCancel;

            foreach ($itemsToProcess as $row) {
                /** @var SaleItem|null $item */
                $item = $itemMap->get($row['sale_item_id']);
                if (! $item) {
                    throw new \DomainException("Item {$row['sale_item_id']} no pertenece a la venta #{$sale->id}.");
                }

                // Nombre para mensajes/snapshot: producto vivo → snapshot de la
                // línea (producto eliminado, 2026-08-18) → #id.
                $itemName = $item->product?->name ?? $item->product_name ?? "#{$item->product_id}";

                $qtyToCancel = (float) $row['quantity'];
                if ($qtyToCancel <= 0) continue;
                if ($qtyToCancel > (float) $item->quantity) {
                    throw new \DomainException("No se puede cancelar {$qtyToCancel} de '{$itemName}': solo quedan {$item->quantity}.");
                }

                $part = $this->cancelledPart($item, $qtyToCancel);
                if ($isLegacy) {
                    $part['surcharge'] = 0.0;
                    $part['discount']  = match (true) {
                        $runSubtotal <= 0.005                   => 0.0,
                        $part['gross'] >= $runSubtotal - 0.005 => $runDiscount,
                        default => round($runDiscount * $part['gross'] / $runSubtotal, 2),
                    };
                }
                $lineRefund = round($part['gross'] - $part['discount'] + $part['surcharge'], 2);

                // Snapshot inmutable (preserva cost_at_sale ADR-015 aunque editemos sale_items).
                // line_total = lo DEVUELTO por la línea (neto) + su desglose.
                $snapshot[] = [
                    'sale_item_id'        => $item->id,
                    'product_id'          => $item->product_id,
                    'name'                => $itemName,
                    'sku'                 => $item->product?->sku ?? $item->product_sku,
                    'qty_cancelled'       => $qtyToCancel,
                    'price'               => (float) $item->price,
                    'cost'                => $item->cost !== null ? (float) $item->cost : null,
                    'line_total'          => $lineRefund,
                    'gross_total'         => $part['gross'],
                    'discount_cancelled'  => $part['discount'],
                    'surcharge_cancelled' => $part['surcharge'],
                ];

                // Restaurar stock en bodega de la tienda original. Si el
                // producto fue ELIMINADO del catálogo (product_id NULL) no hay
                // inventario que restaurar — el reembolso de dinero sí procede.
                if ($item->product_id !== null) {
                    $this->restoreInventory($item->product_id, $sale->store_id, $qtyToCancel, $cancelledBy->id, "Cancelación venta #{$sale->id}");
                }

                // Edit-in-place: decrementa qty y prorratea los montos de la
                // línea. Si llega a 0, borra la fila.
                $newQty = (float) $item->quantity - $qtyToCancel;
                if ($newQty <= 0.0001) {
                    $item->delete();
                } else {
                    $item->quantity = $newQty;
                    $item->total    = round((float) $item->total - $part['gross'], 2);
                    if (! $isLegacy) {
                        $item->discount_amount  = round((float) $item->discount_amount - $part['discount'], 2);
                        $item->surcharge_amount = round((float) ($item->surcharge_amount ?? 0) - $part['surcharge'], 2);
                        if ($item->promo_amount !== null) {
                            $item->promo_amount = round((float) $item->promo_amount - $part['promo'], 2);
                        }
                    }
                    $item->save();
                }

                $runSubtotal  = round($runSubtotal - $part['gross'], 2);
                $runDiscount  = round($runDiscount - $part['discount'], 2);
                $runSurcharge = round($runSurcharge - $part['surcharge'], 2);
            }

            // Recalcular totales de la venta.
            $sale->refresh()->load('items');
            $remainingItemsExist = $sale->items->count() > 0;
            $newSubtotal  = round((float) $sale->items->sum('total'), 2);
            $newDiscount  = $remainingItemsExist ? max(0.0, $runDiscount) : 0.0;
            $newSurcharge = $remainingItemsExist ? max(0.0, $runSurcharge) : 0.0;
            $newTotal     = $remainingItemsExist
                ? round(max(0.0, $newSubtotal - $newDiscount + $newSurcharge), 2)
                : 0.0;
            $amountRefunded = round(max(0.0, $totalBefore - $newTotal), 2);

            // Centavos de redondeo (o datos viejos inconsistentes): la diferencia
            // va al último renglón para que Σ line_total = amount_refunded.
            $diff = round($amountRefunded - array_sum(array_column($snapshot, 'line_total')), 2);
            if ($snapshot !== [] && abs($diff) >= 0.005) {
                $last = count($snapshot) - 1;
                $snapshot[$last]['line_total'] = round($snapshot[$last]['line_total'] + $diff, 2);
            }

            $sale->subtotal  = $newSubtotal;
            $sale->discount  = $newDiscount;
            $sale->surcharge = $newSurcharge;
            $sale->total     = $newTotal;
            $sale->last_cancelled_at = now();

            // Determinar status final.
            if (! $remainingItemsExist || $newTotal <= 0.01) {
                $sale->status              = Sale::STATUS_RETURNED;
                $sale->cancellation_status = Sale::CANCELLATION_FULL;
            } else {
                $sale->cancellation_status = Sale::CANCELLATION_PARTIAL;
            }
            $sale->save();

            // Salida de caja para el reverso de dinero — solo la porción
            // efectivo (prorrateada en cancelaciones parciales de venta mixta).
            $cashRefund = round($amountRefunded * $cashRatio, 2);
            $refundNote = $cashRatio < 1.0
                ? sprintf(' (efectivo $%.2f de $%.2f)', $cashRefund, $amountRefunded)
                : '';
            $cashMovement = $this->createRefundCashMovement(
                amount: $cashRefund,
                description: "Cancelación venta #{$sale->id} · {$reasonCode}{$refundNote}",
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
                    'cash_refunded'    => $cashRefund,
                    'items_count'      => count($snapshot),
                    'cash_movement_id' => $cashMovement?->id,
                ],
            );

            return $cancellation;
        });
    }

    /**
     * Porción cancelada de una línea (2026-09-29): bruto, descuento (promo +
     * manual), aumento y promo, prorrateados por cantidad. La línea completa
     * toma sus montos tal cual (sin residuos de redondeo).
     *
     * @return array{gross: float, discount: float, surcharge: float, promo: float}
     */
    private function cancelledPart(SaleItem $item, float $qtyToCancel): array
    {
        $qty       = (float) $item->quantity;
        $discount  = (float) ($item->discount_amount ?? 0);
        $surcharge = (float) ($item->surcharge_amount ?? 0);
        $promo     = (float) ($item->promo_amount ?? 0);

        if ($qtyToCancel >= $qty - 0.0001) {
            return [
                'gross'     => round((float) $item->total, 2),
                'discount'  => round($discount, 2),
                'surcharge' => round($surcharge, 2),
                'promo'     => round($promo, 2),
            ];
        }

        $ratio = $qtyToCancel / $qty;

        return [
            'gross'     => round($qtyToCancel * (float) $item->price, 2),
            'discount'  => round($discount * $ratio, 2),
            'surcharge' => round($surcharge * $ratio, 2),
            'promo'     => round($promo * $ratio, 2),
        ];
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
            $order->load(['items.product', 'payments.paymentMethod']);
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

            // Pago mixto (2026-08-05): del cajón solo sale lo pagado con
            // métodos cash-like — anticipos por transferencia se reversan por
            // el banco, nunca entraron al cajón.
            $cashRefund = 0.0;
            if ($mode === SaleCancellation::MODE_LIQUIDATION_ROLLBACK) {
                // Reversa SOLO el último payment (la liquidación que se acaba de hacer).
                $lastPayment = $order->payments()->with('paymentMethod')->orderByDesc('id')->first();
                if ($lastPayment) {
                    $amountRefunded = (float) $lastPayment->amount;
                    $cashRefund     = ($lastPayment->paymentMethod?->isCashLike() ?? true) ? $amountRefunded : 0.0;
                    $lastPayment->delete();
                }
                $order->status               = PreSaleOrder::STATUS_READY;
                $order->cancellation_status  = PreSaleOrder::CANCELLATION_PARTIAL;
            } else {
                // FULL: reversa todos los payments y cancela el folio.
                $amountRefunded = (float) $order->payments->sum('amount');
                $cashRefund     = (float) $order->payments
                    ->filter(fn ($p) => $p->paymentMethod?->isCashLike() ?? true)
                    ->sum('amount');
                $order->payments()->delete();
                $order->status               = PreSaleOrder::STATUS_CANCELLED;
                $order->cancellation_status  = PreSaleOrder::CANCELLATION_FULL;
            }
            $order->last_cancelled_at = now();
            $order->save();

            $refundNote = $cashRefund < $amountRefunded
                ? sprintf(' (efectivo $%.2f de $%.2f)', $cashRefund, $amountRefunded)
                : '';
            $cashMovement = $cashRefund > 0
                ? $this->createRefundCashMovement(
                    amount: $cashRefund,
                    description: "Cancelación preventa {$order->code} · {$mode} · {$reasonCode}{$refundNote}",
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
