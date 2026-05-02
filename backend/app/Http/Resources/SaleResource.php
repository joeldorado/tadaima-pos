<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class SaleResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'                  => $this->id,
            'store_id'            => $this->store_id,
            'register_session_id' => $this->register_session_id,
            'user_id'             => $this->user_id,
            'customer_id'         => $this->customer_id,
            'terminal_id'         => $this->terminal_id,
            'draft_id'            => $this->draft_id,

            'subtotal'          => $this->subtotal,
            'discount'          => $this->discount,
            'total'             => $this->total,
            'commission_amount' => $this->commission_amount,
            'status'            => $this->status,

            'customer' => $this->when(
                $this->relationLoaded('customer') && $this->customer,
                fn () => [
                    'id'   => $this->customer->id,
                    'name' => $this->customer->name,
                    'tier' => $this->customer->loyalty_tier,
                ],
            ),

            'items' => $this->when(
                $this->relationLoaded('items'),
                fn () => SaleItemResource::collection($this->items),
            ),

            'payments' => $this->when(
                $this->relationLoaded('payments'),
                fn () => PaymentResource::collection($this->payments),
            ),

            'sold_at'    => $this->sold_at?->toISOString(),
            'created_at' => $this->created_at?->toISOString(),
        ];
    }
}
