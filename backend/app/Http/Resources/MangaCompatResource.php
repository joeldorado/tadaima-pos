<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\Product;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Resource de compatibilidad. Toma un Product con product_type='manga' y
 * devuelve el JSON shape que el frontend (MangaEditModal, ProductsPage tab
 * "Tomos", etc.) esperaba del legacy MangaResource.
 *
 * Una vez migrado el frontend para consumir ProductResource directo este
 * resource puede eliminarse.
 */
class MangaCompatResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        /** @var Product $product */
        $product = $this->resource;

        $user = $request->user();
        $canViewCost = $user?->hasRole(['admin', 'super_admin', 'owner', 'dueño']) && ($user->can_view_cost ?? false);

        $details = $product->relationLoaded('mangaDetails') ? $product->mangaDetails : null;
        $price   = $product->relationLoaded('price') ? $product->price : null;
        $firstImg = $product->relationLoaded('images') ? $product->images->first() : null;

        // public_price legacy = price_1 si existe, fallback a 0.
        $publicPrice = (float) ($price?->price_1 ?? 0);

        // profit_margin_percent: ya no se almacena, lo derivamos de cost vs price
        // si ambos existen. Solo informativo en UI admin.
        $cost = (float) ($product->cost ?? 0);
        $margin = ($publicPrice > 0)
            ? round((($publicPrice - $cost) / $publicPrice) * 100, 2)
            : 0;

        return [
            'id'                    => $product->id,
            'name'                  => $product->name,
            'volume_number'         => $details?->volume_number,
            'editorial'             => $details?->editorial,
            'code'                  => $product->barcode ?: $product->sku,
            'genre'                 => $details?->genre,
            'public_price'          => $publicPrice,
            'profit_margin_percent' => $this->when($canViewCost, $margin),
            'cost'                  => $this->when($canViewCost, $cost),
            'active'                => (bool) $product->active,
            'price_1'               => $price?->price_1,
            'price_2'               => $price?->price_2,
            'price_3'               => $price?->price_3,
            'price_4'               => $price?->price_4,
            'price_5'               => $price?->price_5,
            'stock'                 => (float) ($product->inventory_sum_quantity ?? 0),
            'image_url'             => $firstImg?->url ?: null,
            'created_at'            => $product->created_at?->toISOString(),
            'updated_at'            => $product->updated_at?->toISOString(),
        ];
    }
}
