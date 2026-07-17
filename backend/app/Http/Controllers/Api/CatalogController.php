<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\AddCatalogProductRequest;
use App\Http\Requests\UpdateCatalogSettingsRequest;
use App\Models\CatalogProduct;
use App\Models\CatalogSetting;
use App\Models\Company;
use App\Models\Product;
use App\Models\Store;
use App\Models\SystemSetting;
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
        if ($resp = $this->catalogEditError()) return $resp;
        if ($resp = $this->storeScopeError(request(), $store->id)) return $resp;

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
        if ($resp = $this->catalogEditError()) return $resp;
        if ($resp = $this->storeScopeError($request, $store->id)) return $resp;

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
        if ($resp = $this->catalogEditError()) return $resp;
        if ($resp = $this->storeScopeError($request, $store->id)) return $resp;

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
        if ($resp = $this->catalogEditError()) return $resp;
        if ($resp = $this->storeScopeError($request, $store->id)) return $resp;

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
        if ($resp = $this->catalogEditError()) return $resp;
        if ($resp = $this->storeScopeError($request, $store->id)) return $resp;

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
        if ($resp = $this->catalogEditError()) return $resp;
        if ($resp = $this->storeScopeError(request(), $store->id)) return $resp;

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

        // Stock por tienda como subquery (SUM de inventory en las bodegas de la
        // tienda). Reemplaza el subquery por-item del .map() anterior → sin N+1
        // y disponible para filtrar agotados en SQL.
        $stockSub = function ($q) use ($store) {
            $q->selectRaw('COALESCE(SUM(inventory.quantity), 0)')
                ->from('inventory')
                ->join('warehouses', 'warehouses.id', '=', 'inventory.warehouse_id')
                ->whereColumn('inventory.product_id', 'catalog_products.product_id')
                ->where('warehouses.store_id', $store->id);
        };

        $query = CatalogProduct::query()
            ->select('catalog_products.*')
            ->selectSub($stockSub, 'stock_qty')
            ->with(['product.price', 'product.images', 'product.category'])
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

        // Ocultar agotados: filtro en la query (whereExists con SUM), NO en el
        // .map() — filtrar la página rota `pagination.total` y deja páginas
        // incompletas. El whereExists no usa alias de select, así que el count
        // de paginate() no se rompe.
        if ($settings->hide_out_of_stock) {
            $query->whereExists(function ($q) use ($store) {
                $q->selectRaw('1')
                    ->from('inventory')
                    ->join('warehouses', 'warehouses.id', '=', 'inventory.warehouse_id')
                    ->whereColumn('inventory.product_id', 'catalog_products.product_id')
                    ->where('warehouses.store_id', $store->id)
                    ->groupBy('inventory.product_id')
                    ->havingRaw('SUM(inventory.quantity) > 0');
            });
        }

        $perPage = min((int) ($request->per_page ?? 40), 100);
        $results = $query->paginate($perPage);

        $showPrice = $settings->show_price;
        $showStock = $settings->show_stock;

        $data = collect($results->items())->map(function ($cp) use ($showPrice, $showStock) {
            $p = $cp->product;

            $item = [
                'id'          => $p->id,
                'name'        => $p->name,
                'description' => $p->description,
                'category'    => $p->category ? ['id' => $p->category->id, 'name' => $p->category->name] : null,
                'images'      => $p->images->map(fn ($img) => ['id' => $img->id, 'path' => $img->image_path, 'url' => $img->url, 'sort_order' => $img->sort_order]),
            ];

            if ($showPrice && $p->price) {
                $item['price'] = $p->price->price_1;
            }

            if ($showStock) {
                $item['stock'] = (float) ($cp->stock_qty ?? 0);
            }

            return $item;
        });

        // Número de WhatsApp del catálogo; fallback al teléfono de la sucursal.
        $waNumber = $settings->whatsapp_number ?: $store->phone;

        return $this->success([
            'store' => ['id' => $store->id, 'name' => $store->name],
            'catalog' => [
                'show_price'        => $showPrice,
                'show_stock'        => $showStock,
                'show_search'       => (bool) $settings->show_search,
                'show_categories'   => (bool) $settings->show_categories,
                'show_description'  => (bool) $settings->show_description,
                'cart_enabled'      => (bool) $settings->cart_enabled,
                'hide_out_of_stock' => (bool) $settings->hide_out_of_stock,
                'whatsapp_number'   => $waNumber,
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

    /**
     * GET /public/catalog  (global, sin auth)
     *
     * Catálogo de toda la cadena (v2): productos activos con stock vendible
     * (exhibición, warehouse type='store') en alguna sucursal, con el desglose
     * de existencias por tienda + total. Los flags de visibilidad son globales
     * (system_settings, keys `catalog_*`). El WhatsApp de pedidos es POR TIENDA
     * (`catalog_settings.whatsapp_number` ?? `stores.phone`).
     */
    public function publicCatalogGlobal(Request $request): JsonResponse
    {
        $flags = $this->globalCatalogFlags();

        $query = Product::query()
            ->where('active', true)
            // activePromotions = scope currentlyActive (status + ventana); aquí
            // van TODAS las vigentes (globales y por tienda) — la card pública
            // etiqueta "en {sucursal}" cuando la promo es de una sola tienda.
            ->with(['price', 'images', 'category', 'activePromotions'])
            // Solo productos con stock vendible (>0) en alguna tienda ("salga si está en inventario").
            ->whereExists(function ($q) {
                $q->selectRaw('1')
                    ->from('inventory')
                    ->join('warehouses', 'warehouses.id', '=', 'inventory.warehouse_id')
                    ->whereColumn('inventory.product_id', 'products.id')
                    ->where('warehouses.type', 'store')
                    ->groupBy('inventory.product_id')
                    ->havingRaw('SUM(inventory.quantity) > 0');
            });

        if ($request->filled('search')) {
            $term = $request->search;
            $query->where(fn ($q) => $q->where('name', 'like', "%{$term}%")->orWhere('sku', 'like', "%{$term}%"));
        }
        if ($request->filled('category_id')) {
            $query->where('category_id', $request->integer('category_id'));
        }

        $perPage = min((int) ($request->per_page ?? 40), 100);
        // Lo más NUEVO primero (v2.2): id desc = proxy de novedad y orden
        // estable para la paginación de "Cargar más".
        $results = $query->orderByDesc('products.id')->paginate($perPage);

        $productIds = collect($results->items())->pluck('id')->all();
        $stockByProduct = $this->stockBreakdownByStore($productIds);
        $waByStore = $this->whatsappByStore();

        $showPrice = $flags['show_price'];

        $data = collect($results->items())->map(function ($p) use ($showPrice, $stockByProduct, $waByStore) {
            $stores = collect($stockByProduct[$p->id] ?? [])->map(fn ($r) => [
                'store_id'   => (int) $r->store_id,
                'store_name' => $r->store_name,
                'qty'        => (float) $r->qty,
                'whatsapp'   => $waByStore[$r->store_id] ?? null,
            ])->values();

            $item = [
                'id'           => $p->id,
                'name'         => $p->name,
                'product_type' => $p->product_type, // 'manga' | 'product' → secciones en el catálogo
                'description'  => $p->description,
                'category'     => $p->category ? ['id' => $p->category->id, 'name' => $p->category->name] : null,
                'images'       => $p->images->map(fn ($img) => ['id' => $img->id, 'path' => $img->image_path, 'url' => $img->url, 'sort_order' => $img->sort_order]),
                'stores'       => $stores,
                'total'        => (float) $stores->sum('qty'),
                // Promos NxM vigentes (Tienda Online v2.0, 2026-07-18) — la
                // card muestra pill "2x1 · hasta {fecha}".
                'active_promotions' => $p->activePromotions->map(fn ($pr) => [
                    'id'       => $pr->id,
                    'name'     => $pr->name,
                    'type'     => $pr->type ?? \App\Models\ProductPromotion::TYPE_NXM,
                    'buy_n'    => $pr->buy_n !== null ? (int) $pr->buy_n : null,
                    'pay_m'    => $pr->pay_m !== null ? (int) $pr->pay_m : null,
                    'tiers'    => $pr->tiers,
                    'ends_at'  => $pr->ends_at?->toIso8601String(),
                    'store_id' => $pr->store_id !== null ? (int) $pr->store_id : null,
                ])->values(),
            ];

            if ($showPrice && $p->price) {
                $item['price'] = $p->price->price_1;
            }

            return $item;
        });

        return $this->success([
            'catalog'    => $flags,
            'data'       => $data,
            'pagination' => [
                'total'        => $results->total(),
                'per_page'     => $results->perPage(),
                'current_page' => $results->currentPage(),
                'last_page'    => $results->lastPage(),
            ],
        ]);
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    /** Flags globales del catálogo (system_settings, keys `catalog_*`), con defaults. */
    private function globalCatalogFlags(): array
    {
        $defaults = [
            'show_price'        => true,
            'show_stock'        => true,
            'show_search'       => true,
            'show_categories'   => true,
            'show_description'  => true,
            'cart_enabled'      => true,
            'hide_out_of_stock' => false,
        ];

        // Una sola empresa (Tadaima); el público no trae user → primera company.
        $companyId = Company::query()->min('id');
        $stored = $companyId
            ? SystemSetting::where('company_id', $companyId)
                ->where('key', 'like', 'catalog_%')
                ->pluck('value', 'key')
            : collect();

        $flags = [];
        foreach ($defaults as $key => $default) {
            $raw = $stored["catalog_{$key}"] ?? null;
            $flags[$key] = $raw === null ? $default : filter_var($raw, FILTER_VALIDATE_BOOLEAN);
        }

        return $flags;
    }

    /** Desglose de stock vendible (exhibición) por tienda para varios productos. 1 query. */
    private function stockBreakdownByStore(array $productIds): array
    {
        if (empty($productIds)) {
            return [];
        }

        return DB::table('inventory')
            ->join('warehouses', 'warehouses.id', '=', 'inventory.warehouse_id')
            ->join('stores', 'stores.id', '=', 'warehouses.store_id')
            ->whereIn('inventory.product_id', $productIds)
            ->where('warehouses.type', 'store')
            ->groupBy('inventory.product_id', 'warehouses.store_id', 'stores.name')
            ->havingRaw('SUM(inventory.quantity) > 0')
            ->selectRaw('inventory.product_id, warehouses.store_id, stores.name as store_name, SUM(inventory.quantity) as qty')
            ->get()
            ->groupBy('product_id')
            ->map(fn ($g) => $g->all())
            ->all();
    }

    /** Mapa store_id => WhatsApp de pedidos (catalog_settings.whatsapp_number ?? stores.phone). */
    private function whatsappByStore(): array
    {
        return DB::table('stores')
            ->leftJoin('catalog_settings', 'catalog_settings.store_id', '=', 'stores.id')
            ->selectRaw("stores.id, COALESCE(NULLIF(catalog_settings.whatsapp_number, ''), stores.phone) as wa")
            ->pluck('wa', 'id')
            ->all();
    }

    private function formatSettings(CatalogSetting $s, Store $store): array
    {
        return [
            'id'                => $s->id,
            'store_id'          => $store->id,
            'store_name'        => $store->name,
            'store_phone'       => $store->phone,
            'catalog_url'       => $s->catalog_url,
            'whatsapp_number'   => $s->whatsapp_number,
            'show_price'        => $s->show_price,
            'show_stock'        => $s->show_stock,
            'show_search'       => (bool) $s->show_search,
            'show_categories'   => (bool) $s->show_categories,
            'show_description'  => (bool) $s->show_description,
            'cart_enabled'      => (bool) $s->cart_enabled,
            'hide_out_of_stock' => (bool) $s->hide_out_of_stock,
            'public_url'        => $s->catalog_url ? url("/api/v1/public/catalog/{$s->catalog_url}") : null,
            'updated_at'        => $s->updated_at?->toISOString(),
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
                'images'      => $p->images->map(fn ($img) => ['id' => $img->id, 'path' => $img->image_path, 'url' => $img->url, 'sort_order' => $img->sort_order]),
            ],
        ];
    }
}
