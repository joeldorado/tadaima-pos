<?php

declare(strict_types=1);

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Slim product payload for SellPage / Caja. Drops fields not needed for
 * checkout (barcode, description, cost, category object, timestamps) and
 * keeps only the first image URL instead of the full images array.
 *
 * Used when ?light=1 is passed to GET /products. Targets ~60% smaller
 * payload than ProductResource, which matters when the catalog has
 * thousands of products that the cashier needs cached locally.
 *
 * Shape:
 * {
 *   id, name, sku, active, category_id,
 *   prices: { price_1..5 },
 *   image: string | null,
 *   allow_cash, allow_card,
 *   stock_total
 * }
 */
class ProductLightResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $stockTotal = (float) ($this->inventory_sum_quantity ?? 0);

        $firstImage = $this->relationLoaded('images')
            ? $this->images->first()
            : null;

        return [
            'id'          => $this->id,
            'name'        => $this->name,
            'sku'         => $this->sku,
            'active'      => $this->active,
            'category_id' => $this->category_id,

            'prices' => [
                'price_1' => $this->price?->price_1,
                'price_2' => $this->price?->price_2,
                'price_3' => $this->price?->price_3,
                'price_4' => $this->price?->price_4,
                'price_5' => $this->price?->price_5,
            ],

            'image' => $firstImage?->url ?: null,

            'allow_cash' => $this->relationLoaded('paymentMethod')
                ? ($this->paymentMethod?->allow_cash ?? true)
                : true,
            'allow_card' => $this->relationLoaded('paymentMethod')
                ? ($this->paymentMethod?->allow_card ?? true)
                : true,

            'stock_total' => $stockTotal,
        ];
    }
}
