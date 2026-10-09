<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\ProductBundleItem;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Collection;

/**
 * JSON de un paquete (Paquetes, 2026-10-07). Envuelve un Product
 * product_type='bundle' con `bundleItems.component`, `price` e `images`
 * cargados. `availability` (por tienda) y `assemblies` (historial) los pone
 * el controller con los setters; `cost`/`unit_cost` solo con can_view_cost.
 */
class BundleResource extends JsonResource
{
    /** @var list<array<string,mixed>>|null */
    private ?array $availability = null;

    private ?Collection $assemblies = null;

    private ?float $stockTotal = null;

    /** @param list<array<string,mixed>> $rows */
    public function withAvailability(array $rows): self
    {
        $this->availability = $rows;

        return $this;
    }

    public function withAssemblies(Collection $assemblies): self
    {
        $this->assemblies = $assemblies;

        return $this;
    }

    public function withStockTotal(float $stockTotal): self
    {
        $this->stockTotal = $stockTotal;

        return $this;
    }

    public function toArray(Request $request): array
    {
        $user = $request->user();
        $canViewCost = $user instanceof User && $user->canViewCost();

        $items = $this->relationLoaded('bundleItems') ? $this->bundleItems : collect();
        $firstImage = $this->relationLoaded('images') ? $this->images->first() : null;
        $stockTotal = $this->stockTotal ?? (float) ($this->inventory_sum_quantity ?? 0);

        $suggested = 0.0;
        $components = $items->map(function (ProductBundleItem $item) use ($canViewCost, &$suggested) {
            $product = $item->component;
            $price1 = $product?->price?->price_1;
            if ($price1 !== null) {
                $suggested += (float) $price1 * (int) $item->quantity;
            }
            $image = $product && $product->relationLoaded('images') ? $product->images->first()?->url : null;

            return [
                'product_id' => (int) $item->component_product_id,
                'name' => $product?->name ?? "Producto #{$item->component_product_id}",
                'sku' => $product?->sku ?? '',
                'quantity' => (int) $item->quantity,
                'position' => (int) $item->position,
                'image' => $image ?: null,
                'price_1' => $price1 !== null ? (float) $price1 : null,
                'cost' => $this->when($canViewCost, fn () => $product?->cost !== null ? (float) $product->cost : null),
                'active' => (bool) ($product?->active ?? false),
            ];
        })->values()->all(); // array plano: JsonResource solo quita MissingValue (cost gateado) en arrays

        return [
            'id' => $this->id,
            'product_type' => 'bundle',
            'name' => $this->name,
            'sku' => $this->sku,
            'barcode' => $this->barcode,
            'description' => $this->description,
            'active' => (bool) $this->active,
            'catalog_visible' => (bool) $this->catalog_visible,
            'cost' => $this->when($canViewCost, fn () => $this->cost !== null ? (float) $this->cost : null),
            'prices' => [
                'price_1' => $this->price?->price_1 !== null ? (float) $this->price->price_1 : null,
                'price_2' => $this->price?->price_2 !== null ? (float) $this->price->price_2 : null,
                'price_3' => $this->price?->price_3 !== null ? (float) $this->price->price_3 : null,
                'price_4' => $this->price?->price_4 !== null ? (float) $this->price->price_4 : null,
                'price_5' => $this->price?->price_5 !== null ? (float) $this->price->price_5 : null,
            ],
            'image' => $firstImage?->url ?: null,
            'images' => $this->relationLoaded('images')
                ? $this->images->map(fn ($img) => [
                    'id' => $img->id,
                    'image_path' => $img->image_path,
                    'url' => $img->url,
                    'sort_order' => (int) $img->sort_order,
                ])->values()
                : [],
            'components_count' => $items->count(),
            'suggested_price_sum' => round($suggested, 2),
            'components' => $components,
            'stock_total' => $stockTotal,
            'composition_locked' => $stockTotal > 0,
            'availability' => $this->availability ?? [],
            'assemblies' => $this->assemblies !== null
                ? BundleAssemblyResource::collection($this->assemblies)->resolve($request)
                : [],
            'created_at' => $this->created_at?->toIso8601String(),
            'updated_at' => $this->updated_at?->toIso8601String(),
        ];
    }
}
