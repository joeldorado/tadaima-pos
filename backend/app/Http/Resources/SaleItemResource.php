<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class SaleItemResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        // admin O can_view_cost (gerentes lo traen de fábrica desde 2026-06-10)
        $isAdmin = $request->user()?->canViewCost() ?? false;

        return [
            'id'         => $this->id,
            'product_id' => $this->product_id,
            'quantity'   => $this->quantity,
            'price'      => $this->price,
            'total'      => $this->total,

            // `cost` snapshot al momento del INSERT (lo que se vendió a ese costo).
            // Solo se expone a admins — gerente/cajero no ven margen. Esta es la
            // verdad histórica; `product.cost` puede mutar después, pero esta
            // columna queda inmutable después del checkout.
            'cost' => $isAdmin && $this->cost !== null ? (float) $this->cost : null,

            'product' => $this->when(
                $this->relationLoaded('product') && $this->product,
                fn () => array_merge(
                    [
                        'id'   => $this->product->id,
                        'name' => $this->product->name,
                        'sku'  => $this->product->sku,
                    ],
                    // Legacy fallback: `product.cost` actual del producto.
                    // El frontend prefiere `sale_items.cost` (snapshot histórico);
                    // este campo queda para ventas anteriores a la migración de
                    // cost_at_sale que no tengan snapshot.
                    $isAdmin
                        ? ['cost' => $this->product->cost !== null ? (float) $this->product->cost : null]
                        : [],
                ),
            ),

            'created_at' => $this->created_at?->toISOString(),
        ];
    }
}
