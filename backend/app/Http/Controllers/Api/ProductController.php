<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreProductRequest;
use App\Http\Requests\UpdateProductRequest;
use App\Http\Resources\ProductLightResource;
use App\Http\Resources\ProductResource;
use App\Models\Product;
use App\Models\ProductImage;
use App\Models\ProductStorePrice;
use App\Models\Store;
use App\Models\SystemLog;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

class ProductController extends Controller
{
    /**
     * GET /products
     *
     * Query params opcionales:
     *   ?search=    filtro por name / sku / barcode
     *   ?active=1   solo productos activos
     *   ?per_page=N paginación (default 100, 0 = todos)
     */
    public function index(Request $request): JsonResponse
    {
        $storeId = $request->filled('store_id') ? (int) $request->store_id : null;
        $light = $request->boolean('light');

        // Light mode: drop category eager-load (only category_id is sent).
        // Cuando filtramos por product_type='manga', eager-load mangaDetails
        // para que el resource pueda exponer volume/editorial/genre.
        $type = $request->filled('type') ? (string) $request->get('type') : null;
        $needsMangaDetails = $type === Product::TYPE_MANGA;

        // Light siempre carga mangaDetails: la Caja necesita volume_number para
        // distinguir tomos de la misma serie en el catálogo (QA 2026-06-11).
        $relations = $light
            ? ['price', 'images', 'paymentMethod', 'mangaDetails']
            : ['category', 'price', 'images', 'paymentMethod'];
        if ($needsMangaDetails && ! $light) {
            $relations[] = 'mangaDetails';
        }

        $query = Product::query()->with($relations);

        if ($type !== null) {
            $query->ofType($type);
        }

        // Scope the stock sum to the selected store's warehouses when filtering
        if ($storeId) {
            $query->withSum(['inventory' => fn ($q) =>
                $q->whereHas('warehouse', fn ($wq) =>
                    $wq->where('store_id', $storeId)
                )
            ], 'quantity');
        } else {
            $query->withSum('inventory', 'quantity');
        }

        if ($request->filled('search')) {
            $query->search($request->search);
        }

        if ($request->boolean('active')) {
            $query->active();
        }

        if ($storeId) {
            $query->whereHas('inventory', fn ($q) =>
                $q->whereHas('warehouse', fn ($wq) =>
                    $wq->where('store_id', $storeId)
                )
            );
        }

        // Order by top sellers (last 30 days) when ?sort=top. The withCount
        // counts sale_items joined within the last 30 days; we order desc by
        // that count, then by id desc as a stable tie-breaker (newest wins).
        // Useful for warming the cache with the most-likely-needed products
        // before the cashier opens Caja.
        if ($request->get('sort') === 'top') {
            $since = now()->subDays(30);
            $query->withCount(['saleItems as recent_sales_count' => function ($q) use ($since) {
                $q->whereHas('sale', fn ($sq) => $sq->where('created_at', '>=', $since));
            }])->orderByDesc('recent_sales_count')->orderByDesc('id');
        }

        $perPage = (int) $request->get('per_page', 100);

        $products = $perPage > 0
            ? $query->paginate($perPage)
            : $query->get();

        $items = $perPage > 0 ? $products->items() : $products;

        $collection = $light
            ? ProductLightResource::collection($items)
            : ProductResource::collection($items);

        return $this->success($collection);
    }

    /**
     * GET /products/{product}
     */
    public function show(Product $product): JsonResponse
    {
        $product->load(['category', 'price', 'images', 'paymentMethod'])
                ->loadSum('inventory', 'quantity');

        return $this->success(new ProductResource($product));
    }

    /**
     * POST /products
     *
     * Body:
     * {
     *   name, sku, barcode?, description?, category_id?, cost?, active?,
     *   prices?: { price_1, price_2, price_3, price_4, price_5 },
     *   allow_cash?, allow_card?
     * }
     */
    public function store(StoreProductRequest $request): JsonResponse
    {
        $product = DB::transaction(function () use ($request) {
            $payload = $request->only([
                'name', 'sku', 'barcode', 'description', 'category_id', 'cost', 'active',
            ]);
            // product_type opcional — admin de mangas lo manda como 'manga'.
            // Default 'product' viene del modelo.
            if ($request->filled('product_type')) {
                $payload['product_type'] = $request->get('product_type');
            }
            $product = Product::create($payload);

            $this->syncPrices($product, $request->input('prices', []));
            $this->syncPaymentMethod($product, $request);
            $this->syncMangaDetails($product, $request);

            return $product;
        });

        $product->load(['category', 'price', 'images', 'paymentMethod', 'mangaDetails'])
                ->loadSum('inventory', 'quantity');

        SystemLog::write(
            action: 'product.created',
            description: "Producto creado: {$product->name} (SKU: {$product->sku})",
            entityType: 'product',
            entityId: $product->id,
            meta: [
                'sku'         => $product->sku,
                'name'        => $product->name,
                'category_id' => $product->category_id,
                'cost'        => $product->cost,
            ],
        );

        return $this->success(new ProductResource($product), 'Producto creado', 201);
    }

    /**
     * PUT /products/{product}
     *
     * Misma estructura que POST. Solo enviar los campos a modificar.
     */
    public function update(UpdateProductRequest $request, Product $product): JsonResponse
    {
        if ($resp = $this->adminOrManagerGateError()) {
            return $resp;
        }

        // Snapshot ANTES de mutar — para construir el diff en el log.
        $before = $product->only(['name', 'sku', 'barcode', 'description', 'category_id', 'cost', 'active', 'product_type']);

        DB::transaction(function () use ($request, $product) {
            $payload = $request->only([
                'name', 'sku', 'barcode', 'description', 'category_id', 'cost', 'active',
            ]);
            if ($request->filled('product_type')) {
                $payload['product_type'] = $request->get('product_type');
            }
            $product->update($payload);

            if ($request->has('prices')) {
                $this->syncPrices($product, $request->input('prices', []));
            }

            if ($request->hasAny(['allow_cash', 'allow_card'])) {
                $this->syncPaymentMethod($product, $request);
            }

            $this->syncMangaDetails($product, $request);
        });

        $product->load(['category', 'price', 'images', 'paymentMethod', 'mangaDetails'])
                ->loadSum('inventory', 'quantity');

        // Diff: solo campos que cambiaron, con {old, new}. No registra precios
        // ni payment methods (eso podría hacerse aparte si se necesita).
        $after = $product->only(array_keys($before));
        $changes = [];
        foreach ($before as $field => $oldValue) {
            $newValue = $after[$field] ?? null;
            if ($oldValue != $newValue) {
                $changes[$field] = ['old' => $oldValue, 'new' => $newValue];
            }
        }
        if (! empty($changes) || $request->has('prices') || $request->hasAny(['allow_cash', 'allow_card'])) {
            SystemLog::write(
                action: 'product.updated',
                description: "Producto editado: {$product->name} (SKU: {$product->sku})",
                entityType: 'product',
                entityId: $product->id,
                meta: ['changes' => $changes],
            );
        }

        return $this->success(new ProductResource($product), 'Producto actualizado');
    }

    /**
     * Upsert de detalles específicos de manga (volume_number, editorial, genre).
     * Solo aplica si product_type === 'manga' y el request trae el sub-objeto.
     */
    private function syncMangaDetails(Product $product, $request): void
    {
        if ($product->product_type !== Product::TYPE_MANGA) {
            return;
        }
        if (! $request->hasAny(['manga_details', 'volume_number', 'editorial', 'genre'])) {
            return;
        }

        $details = $request->input('manga_details', []);
        // Aceptar tanto `manga_details: {...}` como campos flat al top-level
        // (para compatibilidad con el formulario actual de MangaEditModal).
        $payload = [
            'volume_number' => $details['volume_number'] ?? $request->input('volume_number'),
            'editorial'     => $details['editorial']     ?? $request->input('editorial'),
            'genre'         => $details['genre']         ?? $request->input('genre'),
        ];

        \App\Models\ProductMangaDetail::updateOrCreate(
            ['product_id' => $product->id],
            $payload,
        );
    }

    // ─── Destroy ──────────────────────────────────────────────────────────────

    /**
     * DELETE /products/{product}
     * Marca el producto como inactivo (soft-delete lógico).
     * No permite eliminar si tiene ventas registradas.
     */
    public function destroy(Product $product): JsonResponse
    {
        if ($resp = $this->adminOrManagerGateError()) {
            return $resp;
        }

        $salesCount    = DB::table('sale_items')->where('product_id', $product->id)->count();
        $layawaysCount = DB::table('layaways')->where('product_id', $product->id)->count();

        if ($salesCount > 0 || $layawaysCount > 0) {
            $reasons = [];
            if ($salesCount > 0)    $reasons[] = "{$salesCount} venta(s)";
            if ($layawaysCount > 0) $reasons[] = "{$layawaysCount} apartado(s) activo(s)";

            return $this->error(
                'No se puede eliminar: el producto tiene ' . implode(' y ', $reasons) . '. Puedes desactivarlo.',
                422
            );
        }

        // Delete images from default storage (gcs en prod, public/local en dev)
        foreach ($product->images as $image) {
            Storage::delete($image->image_path);
        }

        $productSnapshot = ['id' => $product->id, 'name' => $product->name, 'sku' => $product->sku];
        $product->delete();

        SystemLog::write(
            action: 'product.deleted',
            description: "Producto eliminado: {$productSnapshot['name']} (SKU: {$productSnapshot['sku']})",
            entityType: 'product',
            entityId: $productSnapshot['id'],
            meta: ['mode' => 'soft', 'snapshot' => $productSnapshot],
        );

        return $this->success(null, 'Producto eliminado.');
    }

    /**
     * DELETE /products/{product}/force
     * Elimina el producto sin importar ventas ni apartados.
     * Limpia manualmente las tablas sin cascade antes de borrar.
     */
    public function forceDestroy(Product $product): JsonResponse
    {
        if ($resp = $this->adminOrManagerGateError()) {
            return $resp;
        }

        $productSnapshot = ['id' => $product->id, 'name' => $product->name, 'sku' => $product->sku];

        DB::transaction(function () use ($product) {
            // Delete images from default storage (gcs en prod, public/local en dev)
            foreach ($product->images as $image) {
                Storage::delete($image->image_path);
            }

            // Manually handle tables without cascade
            DB::table('layaways')->where('product_id', $product->id)->delete();

            $product->delete();
        });

        SystemLog::write(
            action: 'product.force_deleted',
            description: "Producto eliminado forzosamente: {$productSnapshot['name']} (SKU: {$productSnapshot['sku']})",
            entityType: 'product',
            entityId: $productSnapshot['id'],
            meta: ['mode' => 'force', 'snapshot' => $productSnapshot],
        );

        return $this->success(null, 'Producto eliminado forzosamente.');
    }

    // ─── Images ───────────────────────────────────────────────────────────────

    /**
     * POST /products/{product}/images/upload
     * Sube un archivo de imagen y lo asocia al producto.
     * Body: multipart/form-data con campo "image"
     */
    public function uploadImage(Request $request, Product $product): JsonResponse
    {
        $request->validate([
            'image' => ['required', 'file', 'image', 'max:5120'],
        ]);

        // Usa el disco por default: 'gcs' en prod (deploy.sh inyecta FILESYSTEM_DISK=gcs),
        // 'public' en local (sin credenciales GCP) — el dev solo necesita storage:link.
        try {
            $path = $request->file('image')->store("products/{$product->id}");
        } catch (\Throwable $e) {
            \Log::error('Image upload failed', [
                'disk'  => config('filesystems.default'),
                'error' => $e->getMessage(),
                'trace' => $e->getTraceAsString(),
            ]);
            return $this->error('Error al subir imagen: ' . $e->getMessage(), 500);
        }

        if ($path === false) {
            return $this->error('No se pudo guardar la imagen en el almacenamiento.', 500);
        }

        $image = ProductImage::create([
            'product_id' => $product->id,
            'image_path' => $path,
            'sort_order' => 0,
        ]);

        return $this->success([
            'id'         => $image->id,
            'image_path' => $path,
            'url'        => $image->url,
        ], 'Imagen subida.', 201);
    }

    /**
     * POST /products/{product}/images
     * Agrega una imagen al producto.
     *
     * Body: { image_path: "...", sort_order?: 0 }
     */
    public function addImage(Request $request, Product $product): JsonResponse
    {
        $data = $request->validate([
            'image_path' => ['required', 'string', 'max:500'],
            'sort_order' => ['nullable', 'integer', 'min:0'],
        ]);

        $image = ProductImage::create([
            'product_id' => $product->id,
            'image_path' => $data['image_path'],
            'sort_order' => $data['sort_order'] ?? 0,
        ]);

        return $this->success([
            'id'         => $image->id,
            'image_path' => $image->image_path,
            'sort_order' => $image->sort_order,
        ], 'Imagen añadida.', 201);
    }

    /**
     * DELETE /products/{product}/images/{image}
     */
    public function removeImage(Product $product, ProductImage $image): JsonResponse
    {
        if ($image->product_id !== $product->id) {
            return $this->error('La imagen no pertenece a este producto.', 403);
        }

        Storage::delete($image->image_path);
        $image->delete();

        return $this->success(null, 'Imagen eliminada.');
    }

    /**
     * PUT /products/{product}/images/reorder
     * Reordena imágenes. Body: { "order": [{ id: 1, sort_order: 0 }, ...] }
     */
    public function reorderImages(Request $request, Product $product): JsonResponse
    {
        $request->validate([
            'order'              => ['required', 'array', 'min:1'],
            'order.*.id'         => ['required', 'integer'],
            'order.*.sort_order' => ['required', 'integer', 'min:0'],
        ]);

        DB::transaction(function () use ($request, $product) {
            foreach ($request->input('order') as $item) {
                ProductImage::where('id', $item['id'])
                    ->where('product_id', $product->id)
                    ->update(['sort_order' => $item['sort_order']]);
            }
        });

        $product->load('images');

        return $this->success(
            $product->images->map(fn ($img) => ['id' => $img->id, 'image_path' => $img->image_path, 'sort_order' => $img->sort_order]),
            'Imágenes reordenadas.'
        );
    }

    // ─── Store Prices ─────────────────────────────────────────────────────────

    /**
     * GET /products/{product}/store-prices
     * Lista los precios por tienda para este producto.
     */
    public function storePrices(Product $product): JsonResponse
    {
        $prices = ProductStorePrice::with('store')
            ->where('product_id', $product->id)
            ->get()
            ->groupBy('store_id')
            ->map(function ($rows, $storeId) {
                $store = $rows->first()->store;
                $levels = $rows->mapWithKeys(fn ($r) => ["price_{$r->price_level}" => $r->price]);

                return [
                    'store_id'   => $storeId,
                    'store_name' => $store?->name,
                    'prices'     => $levels,
                ];
            })
            ->values();

        return $this->success($prices);
    }

    /**
     * PUT /products/{product}/store-prices/{store}
     * Upsert de precios por tienda. Enviar solo los niveles a modificar.
     *
     * Body: { "price_1": 150, "price_2": 130, ... }
     */
    public function updateStorePrices(Request $request, Product $product, Store $store): JsonResponse
    {
        $data = $request->validate([
            'price_1' => ['nullable', 'numeric', 'min:0'],
            'price_2' => ['nullable', 'numeric', 'min:0'],
            'price_3' => ['nullable', 'numeric', 'min:0'],
            'price_4' => ['nullable', 'numeric', 'min:0'],
            'price_5' => ['nullable', 'numeric', 'min:0'],
        ]);

        DB::transaction(function () use ($data, $product, $store) {
            foreach ($data as $key => $value) {
                $level = (int) str_replace('price_', '', $key);

                if ($value === null) {
                    ProductStorePrice::where('product_id', $product->id)
                        ->where('store_id', $store->id)
                        ->where('price_level', $level)
                        ->delete();
                } else {
                    ProductStorePrice::updateOrCreate(
                        ['product_id' => $product->id, 'store_id' => $store->id, 'price_level' => $level],
                        ['price'      => $value]
                    );
                }
            }
        });

        // Return updated store prices for this store
        $prices = ProductStorePrice::where('product_id', $product->id)
            ->where('store_id', $store->id)
            ->get()
            ->mapWithKeys(fn ($r) => ["price_{$r->price_level}" => $r->price]);

        return $this->success([
            'store_id'   => $store->id,
            'store_name' => $store->name,
            'prices'     => $prices,
        ], 'Precios por tienda actualizados.');
    }

    /**
     * DELETE /products/{product}/store-prices/{store}
     * Elimina todos los overrides de precio para una tienda.
     */
    public function removeStorePrices(Product $product, Store $store): JsonResponse
    {
        ProductStorePrice::where('product_id', $product->id)
            ->where('store_id', $store->id)
            ->delete();

        return $this->success(null, 'Precios por tienda eliminados. Se usarán los precios base.');
    }

    // ─── Helpers privados ─────────────────────────────────────────────────────

    private function syncPrices(Product $product, array $prices): void
    {
        if (empty($prices)) {
            return;
        }

        $product->price()->updateOrCreate(
            ['product_id' => $product->id],
            [
                'price_1' => $prices['price_1'] ?? null,
                'price_2' => $prices['price_2'] ?? null,
                'price_3' => $prices['price_3'] ?? null,
                'price_4' => $prices['price_4'] ?? null,
                'price_5' => $prices['price_5'] ?? null,
            ]
        );
    }

    private function syncPaymentMethod(Product $product, Request $request): void
    {
        $data = array_filter([
            'allow_cash' => $request->input('allow_cash'),
            'allow_card' => $request->input('allow_card'),
        ], fn ($v) => $v !== null);

        if (empty($data)) {
            return;
        }

        $product->paymentMethod()->updateOrCreate(
            ['product_id' => $product->id],
            $data
        );
    }
}
