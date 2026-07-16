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
        // Caja vende SOLO de Exhibición. Con store_id el controller expone
        // `stock_exhibicion`/`stock_bodega`; el stock vendible es Exhibición y
        // `stock_bodega` alimenta el badge "N en bodega".
        $stockTotal = $this->stock_exhibicion !== null
            ? (float) $this->stock_exhibicion
            : (float) ($this->inventory_sum_quantity ?? 0);
        $stockBodega = (float) ($this->stock_bodega ?? 0);

        $firstImage = $this->relationLoaded('images')
            ? $this->images->first()
            : null;

        return [
            'id'          => $this->id,
            'name'        => $this->name,
            'sku'         => $this->sku,
            // Necesario para que el frontend matchee el resultado exacto del
            // scanner cuando el código escaneado es el barcode (mangas/libros).
            'barcode'     => $this->barcode,
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

            'stock_total'  => $stockTotal,
            // Backstock atrás (no vendible) — para el badge "N en bodega" en Caja.
            'stock_bodega' => $stockBodega,

            // Solo presente cuando se lista por tienda (?store_id). false = el
            // producto no tiene inventario en esta tienda ("No asignado" → la
            // sucursal puede agregarle stock). Omitido en la vista global.
            'is_assigned' => $this->when(isset($this->is_assigned), fn () => (bool) $this->is_assigned),

            // Discriminador para que el frontend filtre/etiquete mangas si lo
            // necesita. Default 'product' por compatibilidad con rows que aún
            // no tienen la columna en envs viejos.
            'product_type' => $this->product_type ?? 'product',

            // Número de tomo para mangas — la Caja lo muestra junto al nombre
            // para distinguir tomos de la misma serie (QA 2026-06-11).
            'volume_number' => $this->relationLoaded('mangaDetails')
                ? $this->mangaDetails?->volume_number
                : null,

            // Promos NxM VIGENTES (Fase 3) — el motor de Caja (saleCalc.ts)
            // elige la mejor por línea; el backend recomputa igual al cobrar.
            'active_promotions' => $this->relationLoaded('activePromotions')
                ? $this->activePromotions->map(fn ($p) => [
                    'id'       => $p->id,
                    'name'     => $p->name,
                    'buy_n'    => (int) $p->buy_n,
                    'pay_m'    => (int) $p->pay_m,
                    'priority' => (int) $p->priority,
                    'store_id' => $p->store_id !== null ? (int) $p->store_id : null,
                    'ends_at'  => $p->ends_at?->toIso8601String(),
                ])->values()
                : [],
        ];
    }
}
