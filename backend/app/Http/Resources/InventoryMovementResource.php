<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class InventoryMovementResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'           => $this->id,
            'product_id'   => $this->product_id,
            'warehouse_id' => $this->warehouse_id,
            'type'         => $this->type,
            'quantity'     => $this->quantity,
            'reference'    => $this->reference,
            'notes'        => $this->notes,
            'user_id'      => $this->user_id,

            'product' => $this->when(
                $this->relationLoaded('product'),
                fn () => [
                    'id'  => $this->product->id,
                    'name'=> $this->product->name,
                    'sku' => $this->product->sku,
                ],
            ),

            'warehouse' => $this->when(
                $this->relationLoaded('warehouse'),
                fn () => [
                    'id'   => $this->warehouse->id,
                    'name' => $this->warehouse->name,
                ],
            ),

            'user' => $this->when(
                $this->relationLoaded('user'),
                fn () => [
                    'id'   => $this->user->id,
                    'name' => $this->user->name,
                ],
            ),

            'created_at' => $this->created_at?->toISOString(),
        ];
    }
}
