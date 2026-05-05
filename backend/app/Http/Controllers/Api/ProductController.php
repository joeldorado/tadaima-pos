<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreProductRequest;
use App\Http\Requests\UpdateProductRequest;
use App\Http\Resources\ProductResource;
use App\Models\Product;
use App\Models\ProductImage;
use App\Models\ProductStorePrice;
use App\Models\Store;
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

        $query = Product::query()
            ->with(['category', 'price', 'images', 'paymentMethod']);

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

        $perPage = (int) $request->get('per_page', 100);

        $products = $perPage > 0
            ? $query->paginate($perPage)
            : $query->get();

        return $this->success(
            ProductResource::collection($perPage > 0 ? $products->items() : $products)
        );
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
            $product = Product::create($request->only([
                'name', 'sku', 'barcode', 'description', 'category_id', 'cost', 'active',
            ]));

            $this->syncPrices($product, $request->input('prices', []));
            $this->syncPaymentMethod($product, $request);

            return $product;
        });

        $product->load(['category', 'price', 'images', 'paymentMethod'])
                ->loadSum('inventory', 'quantity');

        return $this->success(new ProductResource($product), 'Producto creado', 201);
    }

    /**
     * PUT /products/{product}
     *
     * Misma estructura que POST. Solo enviar los campos a modificar.
     */
    public function update(UpdateProductRequest $request, Product $product): JsonResponse
    {
        DB::transaction(function () use ($request, $product) {
            $product->update($request->only([
                'name', 'sku', 'barcode', 'description', 'category_id', 'cost', 'active',
            ]));

            if ($request->has('prices')) {
                $this->syncPrices($product, $request->input('prices', []));
            }

            if ($request->hasAny(['allow_cash', 'allow_card'])) {
                $this->syncPaymentMethod($product, $request);
            }
        });

        $product->load(['category', 'price', 'images', 'paymentMethod'])
                ->loadSum('inventory', 'quantity');

        return $this->success(new ProductResource($product), 'Producto actualizado');
    }

    // ─── Destroy ──────────────────────────────────────────────────────────────

    /**
     * DELETE /products/{product}
     * Marca el producto como inactivo (soft-delete lógico).
     * No permite eliminar si tiene ventas registradas.
     */
    public function destroy(Product $product): JsonResponse
    {
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

        // Delete GCS images before removing DB records
        foreach ($product->images as $image) {
            Storage::disk('gcs')->delete($image->image_path);
        }

        $product->delete();

        return $this->success(null, 'Producto eliminado.');
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

        try {
            $path = $request->file('image')->store("products/{$product->id}", 'gcs');
        } catch (\Throwable $e) {
            \Log::error('GCS upload failed', ['error' => $e->getMessage(), 'trace' => $e->getTraceAsString()]);
            return $this->error('GCS error: ' . $e->getMessage(), 500);
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

        Storage::disk('gcs')->delete($image->image_path);
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
