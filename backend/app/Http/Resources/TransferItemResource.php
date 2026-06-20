<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class TransferItemResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'          => $this->id,
            'transfer_id' => $this->transfer_id,
            'product_id'  => $this->product_id,
            'quantity'    => $this->quantity,

            'product' => $this->when(
                $this->relationLoaded('product') && $this->product,
                fn () => [
                    'id'        => $this->product->id,
                    'name'      => $this->product->name,
                    'sku'       => $this->product->sku,
                    'image_url' => $this->relationLoaded('product') && $this->product->relationLoaded('images') 
                                     ? $this->product->images->first()?->url 
                                     : null,
                ],
            ),

            'created_at' => $this->created_at?->toISOString(),
        ];
    }
}
