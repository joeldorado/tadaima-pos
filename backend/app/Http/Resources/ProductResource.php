<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Formato JSON de producto que consume el frontend.
 *
 * {
 *   id, name, sku, barcode, description, cost, active,
 *   category: { id, name },
 *   prices: { price_1..5 },
 *   images: [{ id, image_path, sort_order }],
 *   allow_cash, allow_card,
 *   stock_total
 * }
 */
class ProductResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        // Con store_id el controller desglosa Exhibición/Bodega; el total es la
        // suma de los dos. Sin store_id (vista global) viene de withSum directo.
        $storeScoped = $this->stock_exhibicion !== null || $this->stock_bodega !== null;
        $stockExhibicion = $this->stock_exhibicion !== null ? (float) $this->stock_exhibicion : null;
        $stockBodega     = $this->stock_bodega !== null ? (float) $this->stock_bodega : null;
        $stockTotal = $storeScoped
            ? (float) ($stockExhibicion ?? 0) + (float) ($stockBodega ?? 0)
            : (float) ($this->inventory_sum_quantity ?? 0);

        $user = $request->user();
        // Costo visible para: admin/master (siempre) O cualquier usuario con el
        // flag `can_view_cost` delegado por el admin (cajero/gerente). Antes era
        // `&&`, lo que bloqueaba a no-admin aunque tuvieran el permiso (bug QA).
        $canViewCost = ($user?->hasRole(['admin', 'super_admin', 'owner', 'dueño']) ?? false)
            || ($user?->can_view_cost ?? false);

        return [
            'id'          => $this->id,
            'name'        => $this->name,
            'sku'         => $this->sku,
            'barcode'     => $this->barcode,
            'description' => $this->description,
            'cost'        => $this->when($canViewCost, $this->cost),
            'active'      => $this->active,
            'category_id' => $this->category_id,

            'category' => $this->when(
                $this->relationLoaded('category') && $this->category,
                fn () => [
                    'id'   => $this->category->id,
                    'name' => $this->category->name,
                ],
            ),

            'supplier_id' => $this->supplier_id,

            'supplier' => $this->when(
                $this->relationLoaded('supplier') && $this->supplier,
                fn () => [
                    'id'   => $this->supplier->id,
                    'name' => $this->supplier->name,
                ],
            ),

            'prices' => $this->when(
                $this->relationLoaded('price'),
                fn () => [
                    'price_1' => $this->price?->price_1,
                    'price_2' => $this->price?->price_2,
                    'price_3' => $this->price?->price_3,
                    'price_4' => $this->price?->price_4,
                    'price_5' => $this->price?->price_5,
                ],
                // Si no fue cargada, devolvemos el objeto vacío igualmente
                // para que el frontend no rompa al acceder a prices.price_1
                ['price_1' => null, 'price_2' => null, 'price_3' => null, 'price_4' => null, 'price_5' => null],
            ),

            'images' => $this->when(
                $this->relationLoaded('images'),
                fn () => $this->images
                    ->filter(fn ($img) => $img->url !== '')
                    ->map(fn ($img) => [
                        'id'         => $img->id,
                        'image_path' => $img->image_path,
                        'url'        => $img->url,
                        'sort_order' => $img->sort_order,
                    ])->values(),
                [],
            ),

            'allow_cash' => $this->relationLoaded('paymentMethod')
                ? ($this->paymentMethod?->allow_cash ?? true)
                : true,
            'allow_card' => $this->relationLoaded('paymentMethod')
                ? ($this->paymentMethod?->allow_card ?? true)
                : true,

            'stock_total' => $stockTotal,
            // Desglose por tipo de almacén (solo presente al filtrar por store_id):
            // Exhibición = vendible en Caja · Bodega = backstock atrás.
            'stock_exhibicion' => $this->when($storeScoped, fn () => (float) ($stockExhibicion ?? 0)),
            'stock_bodega'     => $this->when($storeScoped, fn () => (float) ($stockBodega ?? 0)),

            // Solo al listar por tienda (?store_id). false = sin inventario en
            // esta tienda ("No asignado" → la sucursal le agrega stock).
            'is_assigned' => $this->when(isset($this->is_assigned), fn () => (bool) $this->is_assigned),

            // Discriminador para que el frontend sepa si es producto o manga.
            // Default 'product' por compatibilidad (rows pre-migración).
            'product_type' => $this->product_type ?? 'product',

            // Solo presente cuando product_type='manga' Y mangaDetails fue
            // eager-loaded (ProductController lo carga si ?type=manga).
            'manga_details' => $this->when(
                $this->relationLoaded('mangaDetails') && $this->mangaDetails,
                fn () => [
                    'volume_number' => $this->mangaDetails->volume_number,
                    'editorial'     => $this->mangaDetails->editorial,
                    'genre'         => $this->mangaDetails->genre,
                ],
            ),

            // Promos NxM VIGENTES (Fase 3). El editor de producto usa su
            // propio endpoint CRUD para ver también pausadas/vencidas.
            'active_promotions' => $this->relationLoaded('activePromotions')
                ? $this->activePromotions->map(fn ($p) => [
                    'id'       => $p->id,
                    'name'     => $p->name,
                    'buy_n'    => (int) $p->buy_n,
                    'pay_m'    => (int) $p->pay_m,
                    'priority' => (int) $p->priority,
                    'store_id' => $p->store_id !== null ? (int) $p->store_id : null,
                ])->values()
                : [],

            'created_at' => $this->created_at?->toISOString(),
            'updated_at' => $this->updated_at?->toISOString(),
        ];
    }
}
