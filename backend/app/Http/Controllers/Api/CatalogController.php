<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\AddCatalogProductRequest;
use App\Http\Requests\UpdateCatalogSettingsRequest;
use App\Models\CatalogProduct;
use App\Models\CatalogSetting;
use App\Models\Product;
use App\Models\Store;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class CatalogController extends Controller
{
    // ─── Admin endpoints (auth:sanctum) ───────────────────────────────────────

    /**
     * GET /catalog/settings/{store}
     * Returns (or creates) the catalog settings for a store.
     */
    public function settings(Store $store): JsonResponse
    {
        $settings = CatalogSetting::firstOrCreate(
            ['store_id' => $store->id],
            ['show_price' => true, 'show_stock' => false]
        );

        return $this->success($this->formatSettings($settings, $store));
    }

    /**
     * PUT /catalog/settings/{store}
     */
    public function updateSettings(UpdateCatalogSettingsRequest $request, Store $store): JsonResponse
    {
        $settings = CatalogSetting::firstOrCreate(
            ['store_id' => $store->id],
            ['show_price' => true, 'show_stock' => false]
        );

        $settings->update($request->validated());

        return $this->success($this->formatSettings($settings, $store), 'Configuración de catálogo actualizada.');
    }

    /**
     * GET /catalog/products/{store}
     * Lists all products in the store's catalog (including hidden ones for admin).
     * Filters: visible (boolean)
     */
    public function products(Request $request, Store $store): JsonResponse
    {
        $query = CatalogProduct::with(['product.price', 'product.images', 'product.category'])
            ->where('store_id', $store->id)
            ->when($request->filled('visible'), fn ($q) => $q->where('visible', filter_var($request->visible, FILTER_VALIDATE_BOOLEAN)))
            ->orderBy('created_at', 'desc');

        $perPage = min((int) ($request->per_page ?? 50), 200);
        $results = $query->paginate($perPage);

        return $this->success([
            'data'       => $results->items() ? collect($results->items())->map(fn ($cp) => $this->formatCatalogProduct($cp)) : [],
            'pagination' => [
                'total'        => $results->total(),
                'per_page'     => $results->perPage(),
                'current_page' => $results->currentPage(),
                'last_page'    => $results->lastPage(),
            ],
        ]);
    }

    /**
     * POST /catalog/products/{store}
     * Adds a product to the store's catalog (idempotent — updates visible if exists).
     */
    public function addProduct(AddCatalogProductRequest $request, Store $store): JsonResponse
    {
        $data = $request->validated();

        $cp = CatalogProduct::updateOrCreate(
            ['product_id' => $data['product_id'], 'store_id' => $store->id],
            ['visible'    => $data['visible'] ?? true]
        );

        $cp->load(['product.price', 'product.images', 'product.category']);

        return $this->success($this->formatCatalogProduct($cp), 'Producto añadido al catálogo.', 201);
    }

    /**
     * PUT /catalog/products/{store}/{product}
     * Toggle visibility of a product in the catalog.
     */
    public function updateProduct(Request $request, Store $store, Product $product): JsonResponse
    {
        $request->validate(['visible' => ['required', 'boolean']]);

        $cp = CatalogProduct::where('store_id', $store->id)
            ->where('product_id', $product->id)
            ->firstOrFail();

        $cp->update(['visible' => $request->boolean('visible')]);
        $cp->load(['product.price', 'product.images', 'product.category']);

        return $this->success($this->formatCatalogProduct($cp), 'Visibilidad actualizada.');
    }

    /**
     * DELETE /catalog/products/{store}/{product}
     * Removes a product from the store's catalog.
     */
    public function removeProduct(Store $store, Product $product): JsonResponse
    {
        CatalogProduct::where('store_id', $store->id)
            ->where('product_id', $product->id)
            ->delete();

        return $this->success(null, 'Producto eliminado del catálogo.');
    }

    // ─── Public endpoint (no auth) ────────────────────────────────────────────

    /**
     * GET /public/catalog/{catalogUrl}
     * Public-facing product list for a store's online catalog.
     * Respects show_price and show_stock from catalog_settings.
     */
    public function publicCatalog(Request $request, string $catalogUrl): JsonResponse
    {
        $settings = CatalogSetting::with('store')
            ->where('catalog_url', $catalogUrl)
            ->first();

        if (!$settings) {
            return $this->error('Catálogo no encontrado.', 404);
        }

        $store = $settings->store;

        $query = CatalogProduct::with(['product.price', 'product.images', 'product.category'])
            ->where('store_id', $store->id)
            ->where('visible', true)
            ->whereHas('product', fn ($q) => $q->where('active', true));

        // Search
        if ($request->filled('search')) {
            $term = $request->search;
            $query->whereHas('product', fn ($q) => $q->where('name', 'like', "%{$term}%")
                ->orWhere('sku', 'like', "%{$term}%")
            );
        }

        // Category filter
        if ($request->filled('category_id')) {
            $query->whereHas('product', fn ($q) => $q->where('category_id', $request->integer('category_id')));
        }

        $perPage = min((int) ($request->per_page ?? 40), 100);
        $results = $query->paginate($perPage);

        $showPrice = $settings->show_price;
        $showStock = $settings->show_stock;

        $data = collect($results->items())->map(function ($cp) use ($showPrice, $showStock, $store) {
            $p = $cp->product;

            $item = [
                'id'          => $p->id,
                'name'        => $p->name,
                'description' => $p->description,
                'category'    => $p->category ? ['id' => $p->category->id, 'name' => $p->category->name] : null,
                'images'      => $p->images->map(fn ($img) => ['id' => $img->id, 'path' => $img->image_path, 'sort_order' => $img->sort_order]),
            ];

            if ($showPrice && $p->price) {
                $item['price'] = $p->price->price_1;
            }

            if ($showStock) {
                $item['stock'] = (float) $p->inventory()
                    ->whereHas('warehouse', fn ($q) => $q->where('store_id', $store->id))
                    ->sum('quantity');
            }

            return $item;
        });

        return $this->success([
            'store' => ['id' => $store->id, 'name' => $store->name],
            'catalog' => [
                'show_price' => $showPrice,
                'show_stock' => $showStock,
            ],
            'data' => $data,
            'pagination' => [
                'total'        => $results->total(),
                'per_page'     => $results->perPage(),
                'current_page' => $results->currentPage(),
                'last_page'    => $results->lastPage(),
            ],
        ]);
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    private function formatSettings(CatalogSetting $s, Store $store): array
    {
        return [
            'id'          => $s->id,
            'store_id'    => $store->id,
            'store_name'  => $store->name,
            'catalog_url' => $s->catalog_url,
            'show_price'  => $s->show_price,
            'show_stock'  => $s->show_stock,
            'public_url'  => $s->catalog_url ? url("/api/v1/public/catalog/{$s->catalog_url}") : null,
            'updated_at'  => $s->updated_at?->toISOString(),
        ];
    }

    private function formatCatalogProduct(CatalogProduct $cp): array
    {
        $p = $cp->product;

        return [
            'catalog_product_id' => $cp->id,
            'visible'            => $cp->visible,
            'added_at'           => $cp->created_at?->toISOString(),
            'product' => [
                'id'          => $p->id,
                'name'        => $p->name,
                'sku'         => $p->sku,
                'description' => $p->description,
                'active'      => $p->active,
                'category'    => $p->category ? ['id' => $p->category->id, 'name' => $p->category->name] : null,
                'price_1'     => $p->price?->price_1,
                'images'      => $p->images->map(fn ($img) => ['id' => $img->id, 'path' => $img->image_path, 'sort_order' => $img->sort_order]),
            ],
        ];
    }
}
