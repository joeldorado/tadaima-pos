<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class SaleItemResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        // admin O can_view_cost (el admin activa la visibilidad por usuario en
        // Permisos; los gerentes ya NO la traen por default desde 2026-06-24).
        $isAdmin = $request->user()?->canViewCost() ?? false;

        return [
            'id'         => $this->id,
            'product_id' => $this->product_id,
            'quantity'   => $this->quantity,
            'price'      => $this->price,
            'total'      => $this->total,

            // Descuentos v2 — beneficio por línea. NULL/0 en ventas legacy.
            // El ticket/historial branchean por forma de datos: si algún item
            // trae benefit_type → render v2; si no y sales.discount > 0 → legacy.
            'benefit_type'    => $this->benefit_type,
            'discount_kind'   => $this->discount_kind,
            'discount_basis'  => $this->discount_basis,
            'discount_value'  => $this->discount_value !== null ? (float) $this->discount_value : null,
            'discount_amount' => (float) ($this->discount_amount ?? 0),
            'discount_reason' => $this->discount_reason,
            'discount_note'   => $this->discount_note,
            'promo_name'      => $this->promo_name,
            'promo_free_qty'  => $this->promo_free_qty,
            'promo_amount'    => $this->promo_amount !== null ? (float) $this->promo_amount : null,

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
                        'product_type' => $this->product->product_type,
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
