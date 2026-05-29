<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * ADR-016 — Serialización de log de cancelación.
 *
 * Expone snapshot de items, motivo, monto reversado y referencias a venta/preventa
 * + sesión + cash_movement para que el admin pueda auditar el flujo completo.
 */
class SaleCancellationResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'                => $this->id,
            'sale_id'           => $this->sale_id,
            'pre_sale_order_id' => $this->pre_sale_order_id,
            'mode'              => $this->mode,
            'reason_code'       => $this->reason_code,
            'reason_text'       => $this->reason_text,
            'amount_refunded'   => (float) $this->amount_refunded,
            'cash_movement_id'  => $this->cash_movement_id,
            'cash_session_id'   => $this->cash_session_id,
            'items_snapshot'    => $this->items_snapshot,
            'cancelled_at'      => $this->cancelled_at?->toISOString(),

            'cancelled_by' => $this->when(
                $this->relationLoaded('cancelledByUser') && $this->cancelledByUser,
                fn () => [
                    'id'   => $this->cancelledByUser->id,
                    'name' => $this->cancelledByUser->name,
                ],
            ),

            'sale' => $this->when(
                $this->relationLoaded('sale') && $this->sale,
                fn () => [
                    'id'                  => $this->sale->id,
                    'store_id'            => $this->sale->store_id,
                    'status'              => $this->sale->status,
                    'cancellation_status' => $this->sale->cancellation_status,
                    'total'               => (float) $this->sale->total,
                    'sold_at'             => $this->sale->sold_at?->toISOString(),
                ],
            ),

            'pre_sale_order' => $this->when(
                $this->relationLoaded('preSaleOrder') && $this->preSaleOrder,
                fn () => [
                    'id'                  => $this->preSaleOrder->id,
                    'code'                => $this->preSaleOrder->code,
                    'store_id'            => $this->preSaleOrder->store_id,
                    'status'              => $this->preSaleOrder->status,
                    'cancellation_status' => $this->preSaleOrder->cancellation_status,
                ],
            ),
        ];
    }
}
