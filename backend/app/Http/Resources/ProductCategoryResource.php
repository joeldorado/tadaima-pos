<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class ProductCategoryResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'             => $this->id,
            'name'           => $this->name,
            'description'    => $this->description,
            'active'         => $this->active,

            // El índice usa withCount('products') → llega como atributo
            // products_count (NO carga la relación, por eso relationLoaded()
            // siempre era false y el conteo nunca salía). Se emite si viene el
            // atributo o si la relación está cargada.
            'products_count' => $this->when(
                isset($this->products_count) || $this->relationLoaded('products'),
                fn () => isset($this->products_count)
                    ? (int) $this->products_count
                    : $this->products->count(),
            ),

            'created_at' => $this->created_at?->toISOString(),
            'updated_at' => $this->updated_at?->toISOString(),
        ];
    }
}
