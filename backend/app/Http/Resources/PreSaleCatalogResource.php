<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Storage;

class PreSaleCatalogResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'              => $this->id,
            'status'          => $this->status,
            'product_name'    => $this->product_name,
            'image_path'      => $this->image_path,
            // URL pública lista para usar en <img>. null si no hay imagen.
            'image_url'       => $this->image_path ? Storage::url($this->image_path) : null,
            'cost'            => $this->cost,
            'margin_percent'  => $this->margin_percent,
            'price_1'         => $this->price_1,
            'price_2'         => $this->price_2,
            'price_3'         => $this->price_3,
            'price_4'         => $this->price_4,
            'price_5'         => $this->price_5,
            'advance_payment' => $this->advance_payment,
            'preorder_limit'  => $this->preorder_limit,
            'arrival_date'    => $this->arrival_date?->toDateString(),
            'pickup_deadline' => $this->pickup_deadline?->toDateString(),
            'created_at'      => $this->created_at,
            'updated_at'      => $this->updated_at,

            'category'   => $this->when($this->relationLoaded('category'), fn () => $this->category
                ? ['id' => $this->category->id, 'name' => $this->category->name]
                : null
            ),
            'supplier'   => $this->when($this->relationLoaded('supplier'), fn () => $this->supplier
                ? ['id' => $this->supplier->id, 'name' => $this->supplier->name]
                : null
            ),
            'product'    => $this->when($this->relationLoaded('product'), fn () => $this->product
                ? ['id' => $this->product->id, 'name' => $this->product->name]
                : null
            ),
            'created_by' => $this->when($this->relationLoaded('createdBy'), fn () => $this->createdBy
                ? ['id' => $this->createdBy->id, 'name' => $this->createdBy->name]
                : null
            ),

            'reserved_count'  => $this->when(
                $this->relationLoaded('activeOrderItems'),
                fn () => $this->reserved_count
            ),

            // Límites por tienda (si están definidos). Frontend admin los edita en el
            // tab "Tiendas" del modal de catálogo.
            'store_limits' => $this->when(
                $this->relationLoaded('storeLimits'),
                fn () => $this->storeLimits->map(fn ($sl) => [
                    'store_id'  => (int) $sl->store_id,
                    'limit_qty' => (int) $sl->limit_qty,
                ])->values()
            ),
            'sold_count'      => $this->when(
                $this->relationLoaded('soldOrderItems'),
                fn () => $this->sold_count
            ),
            'delivered_count' => $this->when(
                $this->relationLoaded('deliveredOrderItems'),
                fn () => $this->delivered_count
            ),
        ];
    }
}
