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
            // Fuga QA 2026-06-10: cost y margen iban a TODOS los roles (hasta
            // cajero). Ahora gated igual que el resto: admin o can_view_cost.
            'cost'            => ($request->user()?->canViewCost() ?? false) ? $this->cost : null,
            'margin_percent'  => ($request->user()?->canViewCost() ?? false) ? $this->margin_percent : null,
            'price_1'         => $this->price_1,
            'price_2'         => $this->price_2,
            'price_3'         => $this->price_3,
            'price_4'         => $this->price_4,
            'price_5'         => $this->price_5,
            'advance_payment'    => $this->advance_payment,
            'preorder_limit'     => $this->preorder_limit,
            'limit_per_customer' => $this->limit_per_customer,
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

            // Reservados agrupados por tienda. Sin esto la Caja no puede calcular
            // "disponible en mi tienda" cuando hay store_limits — el reserved_count
            // global mezcla todas las tiendas.
            // Cast a (object) OBLIGATORIO: JsonResource::removeMissingValues hace
            // array_values() a los arrays cuyas keys sean todas numéricas (los
            // store ids lo son) → {4:2} llegaba al frontend como [2] y el lookup
            // por tienda fallaba (QA 2026-06-11: Caja mostraba el límite completo
            // como "disponibles" sin restar apartados). Un objeto no se toca.
            'reserved_by_store' => $this->when(
                $this->relationLoaded('activeOrderItems'),
                fn () => (object) $this->activeOrderItems
                    ->groupBy(fn ($it) => (int) ($it->order->store_id ?? 0))
                    ->map(fn ($group) => (int) $group->sum('quantity'))
                    ->reject(fn ($_, $storeId) => $storeId === 0)
                    ->toArray() // { "store_id": quantity }
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

            // Entregados (liquidados) agrupados por tienda — espejo de
            // reserved_by_store. Necesario para que el panel de catálogos muestre
            // "Liquidados" SOLO de la tienda del gerente (y no el total global).
            // Cast a (object) obligatorio (mismo motivo que reserved_by_store:
            // array_values aplana las keys numéricas de store_id).
            'delivered_by_store' => $this->when(
                $this->relationLoaded('deliveredOrderItems'),
                fn () => (object) $this->deliveredOrderItems
                    ->groupBy(fn ($it) => (int) ($it->order->store_id ?? 0))
                    ->map(fn ($group) => (int) $group->sum('quantity'))
                    ->reject(fn ($_, $storeId) => $storeId === 0)
                    ->toArray() // { "store_id": quantity }
            ),
        ];
    }
}
