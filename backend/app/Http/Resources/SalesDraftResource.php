<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class SalesDraftResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $itemsLoaded = $this->relationLoaded('items');

        return [
            'id'                  => $this->id,
            'store_id'            => $this->store_id,
            'register_session_id' => $this->register_session_id,
            'user_id'             => $this->user_id,
            'customer_id'         => $this->customer_id,
            'status'              => $this->status,

            'subtotal'    => $itemsLoaded ? $this->subtotal : null,
            'items_count' => $itemsLoaded ? $this->items->count() : null,

            'customer' => $this->when(
                $this->relationLoaded('customer') && $this->customer,
                fn () => [
                    'id'   => $this->customer->id,
                    'name' => $this->customer->name,
                    'tier' => $this->customer->loyalty_tier,
                ],
            ),

            'items' => $this->when(
                $itemsLoaded,
                fn () => SalesDraftItemResource::collection($this->items),
            ),

            'created_at' => $this->created_at?->toISOString(),
            'updated_at' => $this->updated_at?->toISOString(),
        ];
    }
}
