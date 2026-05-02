<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PreSalePaymentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'                => $this->id,
            'pre_sale_id'       => $this->pre_sale_id,
            'amount'            => $this->amount,
            'payment_method_id' => $this->payment_method_id,
            'notes'             => $this->notes,

            'payment_method' => $this->when(
                $this->relationLoaded('paymentMethod') && $this->paymentMethod,
                fn () => [
                    'id'   => $this->paymentMethod->id,
                    'name' => $this->paymentMethod->name,
                ],
            ),

            'created_at' => $this->created_at?->toISOString(),
        ];
    }
}
