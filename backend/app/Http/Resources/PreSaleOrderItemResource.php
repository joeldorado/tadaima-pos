<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PreSaleOrderItemResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'                  => $this->id,
            'pre_sale_catalog_id' => $this->pre_sale_catalog_id,
            'product_id'          => $this->product_id,
            'quantity'            => $this->quantity,
            'price_level'         => $this->price_level,
            'unit_price'          => $this->unit_price,
            'subtotal'            => $this->subtotal,
            'status'              => $this->status,
            'delivered_at'        => $this->delivered_at,
            'created_at'          => $this->created_at,
            'product_type'        => $this->product?->product_type ?? ($this->catalog?->product?->product_type ?? 'product'),

            // cost snapshot (ADR-015) — admin o can_view_cost (gerente de
            // fábrica desde 2026-06-10), igual que SaleItemResource. Permite
            // calcular utilidad real de preventas en el Reporte del Día.
            'cost' => ($request->user()?->canViewCost() ?? false) && $this->cost !== null
                ? (float) $this->cost
                : null,

            // Flag NO sensible (dice si hay costo, no cuánto): Caja lo usa para
            // no dejar cargar a liquidar una partida sin costo real. `cost` llega
            // null al cajero aunque exista, así que no sirve para ese chequeo.
            'has_real_cost' => $this->cost !== null && (float) $this->cost > 0,

            'catalog' => $this->when($this->relationLoaded('catalog'), fn () => [
                'id'             => $this->catalog?->id,
                'product_name'   => $this->catalog?->product_name,
                'image_path'     => $this->catalog?->image_path,
                'status'         => $this->catalog?->status,
                'pickup_deadline'=> $this->catalog?->pickup_deadline,
            ]),
        ];
    }
}
