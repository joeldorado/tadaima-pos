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
            // Cambio real al stock con signo (InventoryMovement::stockDelta):
            // `quantity` de una venta o un apartado viene en positivo.
            'stock_delta'  => $this->resource->stockDelta(),
            'reference'    => $this->reference,
            'notes'        => $this->notes,
            'user_id'      => $this->user_id,

            // Las relaciones pueden venir cargadas pero vacías (movimientos de
            // import sin usuario, producto o almacén borrado): null, no un fatal.
            'product' => $this->when(
                $this->relationLoaded('product'),
                fn () => $this->product ? [
                    'id'  => $this->product->id,
                    'name'=> $this->product->name,
                    'sku' => $this->product->sku,
                ] : null,
            ),

            'warehouse' => $this->when(
                $this->relationLoaded('warehouse'),
                fn () => $this->warehouse ? [
                    'id'         => $this->warehouse->id,
                    'name'       => $this->warehouse->name,
                    'type'       => $this->warehouse->type,
                    'store_id'   => $this->warehouse->store_id,
                    'store_name' => $this->warehouse->relationLoaded('store') ? $this->warehouse->store?->name : null,
                ] : null,
            ),

            'user' => $this->when(
                $this->relationLoaded('user'),
                fn () => $this->user ? [
                    'id'   => $this->user->id,
                    'name' => $this->user->name,
                ] : null,
            ),

            'created_at' => $this->created_at?->toISOString(),
        ];
    }
}
