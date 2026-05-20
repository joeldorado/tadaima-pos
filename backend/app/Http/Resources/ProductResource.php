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
        // stock_total viene de withSum('inventory', 'quantity')
        $stockTotal = (float) ($this->inventory_sum_quantity ?? 0);

        $user = $request->user();
        $canViewCost = $user?->hasRole(['admin', 'super_admin', 'owner', 'dueño']) && ($user->can_view_cost ?? false);

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

            'created_at' => $this->created_at?->toISOString(),
            'updated_at' => $this->updated_at?->toISOString(),
        ];
    }
}
