<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class SalesDraftItemResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'         => $this->id,
            'draft_id'   => $this->draft_id,
            'product_id' => $this->product_id,
            'quantity'   => $this->quantity,
            'price'      => $this->price,
            'total'      => $this->total,

            'product' => $this->when(
                $this->relationLoaded('product') && $this->product,
                fn () => [
                    'id'     => $this->product->id,
                    'name'   => $this->product->name,
                    'sku'    => $this->product->sku,
                    'active' => $this->product->active,
                ],
            ),

            'created_at' => $this->created_at?->toISOString(),
        ];
    }
}
