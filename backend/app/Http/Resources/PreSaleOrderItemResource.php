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

            // cost snapshot (ADR-015) — admin-only, igual que SaleItemResource.
            // Permite calcular utilidad real de preventas en el Reporte del Día.
            // Gerente/cajero reciben null (no ven margen).
            'cost' => ($request->user()?->hasRole(['admin', 'super_admin', 'owner', 'dueño']) ?? false) && $this->cost !== null
                ? (float) $this->cost
                : null,

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
