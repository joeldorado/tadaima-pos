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
