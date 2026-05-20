<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreMangaRequest;
use App\Http\Requests\UpdateMangaRequest;
use App\Http\Resources\MangaCompatResource;
use App\Models\Product;
use App\Models\ProductMangaDetail;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * Facade compat: el modelo Manga se migró a Product con product_type='manga'
 * + product_manga_details. Este controller mantiene la API pública /mangas
 * mapeando al modelo Product unificado y devolviendo el shape histórico de
 * MangaResource (vía MangaCompatResource).
 *
 * Cuando el frontend termine de migrar a /products?type=manga, este controller
 * puede eliminarse.
 */
class MangaController extends Controller
{
    /**
     * GET /mangas — lista de productos con product_type='manga'.
     */
    public function index(Request $request): JsonResponse
    {
        $storeId = $request->filled('store_id') ? (int) $request->store_id : null;

        $query = Product::query()
            ->ofType(Product::TYPE_MANGA)
            ->with(['mangaDetails', 'price', 'images'])
            ->when($request->filled('active'), fn ($q) => $q->where(
                'active',
                filter_var($request->active, FILTER_VALIDATE_BOOLEAN),
            ))
            ->when($request->filled('genre'), fn ($q) => $q
                ->whereHas('mangaDetails', fn ($d) => $d->where('genre', $request->genre)))
            ->when($request->filled('editorial'), fn ($q) => $q
                ->whereHas('mangaDetails', fn ($d) => $d->where('editorial', $request->editorial)))
            ->when($request->filled('search'), fn ($q) => $q->where(function ($q2) use ($request) {
                $term = $request->search;
                $q2->where('name', 'like', "%{$term}%")
                   ->orWhere('sku', 'like', "%{$term}%")
                   ->orWhere('barcode', 'like', "%{$term}%");
            }))
            ->orderBy('name');

        if ($storeId) {
            $query->whereHas('inventory', fn ($q) =>
                $q->whereHas('warehouse', fn ($wq) =>
                    $wq->where('store_id', $storeId)
                )
            )->withSum(['inventory' => fn ($q) =>
                $q->whereHas('warehouse', fn ($wq) =>
                    $wq->where('store_id', $storeId)
                )
            ], 'quantity');
        } else {
            $query->withSum('inventory', 'quantity');
        }

        $perPage = min((int) ($request->per_page ?? 50), 200);
        $results = $query->paginate($perPage);

        return $this->success([
            'data'       => MangaCompatResource::collection($results->items()),
            'pagination' => [
                'total'        => $results->total(),
                'per_page'     => $results->perPage(),
                'current_page' => $results->currentPage(),
                'last_page'    => $results->lastPage(),
            ],
        ]);
    }

    /**
     * POST /mangas — crea un producto con product_type='manga' + manga_details.
     */
    public function store(StoreMangaRequest $request): JsonResponse
    {
        $data = $request->validated();

        $product = DB::transaction(function () use ($data) {
            // Mapear campos legacy de manga a campos de product.
            $product = Product::create([
                'name'         => $data['name'],
                'sku'          => $data['code'] ?? ('MANGA-' . uniqid()),
                'barcode'      => $data['code'] ?? null,
                'cost'         => $data['cost'] ?? null,
                'active'       => $data['active'] ?? true,
                'product_type' => Product::TYPE_MANGA,
            ]);

            ProductMangaDetail::create([
                'product_id'    => $product->id,
                'volume_number' => $data['volume_number'] ?? null,
                'editorial'     => $data['editorial'] ?? null,
                'genre'         => $data['genre'] ?? null,
            ]);

            $hasPrice = collect(['price_1','price_2','price_3','price_4','price_5'])
                ->contains(fn ($k) => isset($data[$k]) && $data[$k] !== null);
            if ($hasPrice) {
                $product->price()->create([
                    'price_1' => $data['price_1'] ?? null,
                    'price_2' => $data['price_2'] ?? null,
                    'price_3' => $data['price_3'] ?? null,
                    'price_4' => $data['price_4'] ?? null,
                    'price_5' => $data['price_5'] ?? null,
                ]);
            }

            return $product;
        });

        $product->load(['mangaDetails', 'price', 'images'])
                ->loadSum('inventory', 'quantity');

        return $this->success(new MangaCompatResource($product), 'Manga creado.', 201);
    }

    /**
     * PUT /mangas/{manga} — actualiza producto manga + sus detalles.
     */
    public function update(UpdateMangaRequest $request, Product $manga): JsonResponse
    {
        // Route model binding: {manga} resuelve a Product. Validamos que sea
        // realmente un manga para evitar editar productos regulares por esta vía.
        if ($manga->product_type !== Product::TYPE_MANGA) {
            return $this->error('El producto no es de tipo manga.', 422);
        }

        $data = $request->validated();

        DB::transaction(function () use ($manga, $data): void {
            $productPayload = array_filter([
                'name'    => $data['name']    ?? null,
                'sku'     => $data['code']    ?? null,
                'barcode' => $data['code']    ?? null,
                'cost'    => $data['cost']    ?? null,
                'active'  => array_key_exists('active', $data) ? $data['active'] : null,
            ], fn ($v) => $v !== null);

            if (! empty($productPayload)) {
                $manga->update($productPayload);
            }

            $hasDetail = collect(['volume_number','editorial','genre'])
                ->contains(fn ($k) => array_key_exists($k, $data));
            if ($hasDetail) {
                ProductMangaDetail::updateOrCreate(
                    ['product_id' => $manga->id],
                    [
                        'volume_number' => $data['volume_number'] ?? null,
                        'editorial'     => $data['editorial']     ?? null,
                        'genre'         => $data['genre']         ?? null,
                    ],
                );
            }

            $hasPrice = collect(['price_1','price_2','price_3','price_4','price_5'])
                ->contains(fn ($k) => array_key_exists($k, $data));
            if ($hasPrice) {
                $manga->price()->updateOrCreate(
                    ['product_id' => $manga->id],
                    [
                        'price_1' => $data['price_1'] ?? null,
                        'price_2' => $data['price_2'] ?? null,
                        'price_3' => $data['price_3'] ?? null,
                        'price_4' => $data['price_4'] ?? null,
                        'price_5' => $data['price_5'] ?? null,
                    ],
                );
            }
        });

        $manga->load(['mangaDetails', 'price', 'images'])
              ->loadSum('inventory', 'quantity');

        return $this->success(new MangaCompatResource($manga), 'Manga actualizado.');
    }

    /**
     * POST /mangas/{manga}/image/upload — sube imagen al producto.
     */
    public function uploadImage(Request $request, Product $manga): JsonResponse
    {
        if ($manga->product_type !== Product::TYPE_MANGA) {
            return $this->error('El producto no es de tipo manga.', 422);
        }

        $request->validate([
            'image' => ['required', 'file', 'image', 'max:5120'],
        ]);

        // Reemplaza la imagen primaria (sort_order=0). Productos pueden tener
        // múltiples imágenes pero mangas tradicionalmente solo una.
        $manga->images()->where('sort_order', 0)->each(function ($img) {
            Storage::delete($img->image_path);
            $img->delete();
        });

        $path = $request->file('image')->store("products/{$manga->id}");
        $manga->images()->create([
            'image_path' => $path,
            'sort_order' => 0,
        ]);

        return $this->success([
            'image_url' => Storage::url($path),
        ], 'Imagen subida.', 201);
    }

    /**
     * DELETE /mangas/{manga}
     */
    public function destroy(Product $manga): JsonResponse
    {
        if ($manga->product_type !== Product::TYPE_MANGA) {
            return $this->error('El producto no es de tipo manga.', 422);
        }

        $salesCount = DB::table('sale_items')->where('product_id', $manga->id)->count();
        if ($salesCount > 0) {
            // No borrar physicalmente — desactivar para preservar histórico.
            $manga->update(['active' => false]);
            return $this->success(null, 'Manga desactivado (tiene ventas registradas).');
        }

        $manga->images()->each(function ($img) {
            Storage::delete($img->image_path);
        });
        $manga->delete();

        return $this->success(null, 'Manga eliminado.');
    }
}
