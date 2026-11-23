<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PreSaleOrderPaymentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'         => $this->id,
            'amount'     => $this->amount,
            'notes'      => $this->notes,
            'created_at' => $this->created_at,
            // Preventa con Tarjeta y Mixto (2026-11-23, autorizado por Pier).
            // `delivery_id`: entrega que liquidó este pago (en Mixto son dos
            // pagos con la misma entrega). Comisión: la absorbe la tienda.
            'payment_method_id' => $this->payment_method_id,
            'terminal_id'       => $this->terminal_id,
            'commission_amount' => (float) ($this->commission_amount ?? 0),
            'delivery_id'       => $this->delivery_id,

            'payment_method' => $this->when($this->relationLoaded('paymentMethod'), fn () => [
                'id'   => $this->paymentMethod?->id,
                'name' => $this->paymentMethod?->name,
            ]),
            'cashier' => $this->when($this->relationLoaded('cashier'), fn () => [
                'id'   => $this->cashier?->id,
                'name' => $this->cashier?->name,
            ]),
        ];
    }
}
