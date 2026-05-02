<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class InventoryResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'           => $this->id,
            'product_id'   => $this->product_id,
            'warehouse_id' => $this->warehouse_id,
            'quantity'     => $this->quantity,

            'product' => $this->when(
                $this->relationLoaded('product'),
                fn () => [
                    'id'     => $this->product->id,
                    'name'   => $this->product->name,
                    'sku'    => $this->product->sku,
                    'active' => $this->product->active,
                ],
            ),

            'warehouse' => $this->when(
                $this->relationLoaded('warehouse'),
                fn () => [
                    'id'   => $this->warehouse->id,
                    'name' => $this->warehouse->name,
                    'type' => $this->warehouse->type,
                ],
            ),

            'updated_at' => $this->updated_at?->toISOString(),
        ];
    }
}
