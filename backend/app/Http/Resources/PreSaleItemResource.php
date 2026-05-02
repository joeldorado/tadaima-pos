<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PreSaleItemResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'          => $this->id,
            'product_id'  => $this->product_id,
            'manga_id'    => $this->manga_id,
            'quantity'    => $this->quantity,
            'price_level' => $this->price_level,
            'price'       => $this->price,
            'status'      => $this->status ?? 'pending',
            'total'       => round($this->quantity * $this->price, 2),

            'product' => $this->when(
                $this->relationLoaded('product') && $this->product,
                fn () => [
                    'id'   => $this->product->id,
                    'name' => $this->product->name,
                    'sku'  => $this->product->sku,
                ],
            ),

            'created_at' => $this->created_at?->toISOString(),
        ];
    }
}
