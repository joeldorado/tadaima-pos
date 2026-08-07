<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Product;
use App\Models\UsListing;
use App\Support\SellableStock;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

/**
 * TadaimaUS — ABC de listings (módulo admin del POS, solo administrador).
 * Mensajes en ESPAÑOL: el consumidor es el POS.
 *
 * adminOnlyError() es fail-open con user null → estas rutas viven DENTRO del
 * grupo auth:sanctum en routes/api.php (el 401 lo pone el middleware).
 */
class UsListingController extends Controller
{
    /** Cap del índice de listings (contrato: sin paginación). */
    private const MAX_LISTINGS = 200;

    /** Cap del buscador de productos no listados (contrato). */
    private const MAX_PRODUCTS = 50;

    /**
     * GET /us/listings?search=
     * Search por nombre/sku del PRODUCTO. Cada listing embebe su product
     * (id, name, sku); image_url con fallback a la foto del producto.
     */
    public function index(Request $request): JsonResponse
    {
        if ($resp = $this->adminOnlyError()) {
            return $resp;
        }

        $listings = UsListing::query()
            ->with('product.images')
            ->when($request->filled('search'), function ($q) use ($request) {
                $term = trim((string) $request->input('search'));
                $q->whereHas('product', fn ($p) => $p
                    ->whereLike('name', "%{$term}%", caseSensitive: false)
                    ->orWhereLike('sku', "%{$term}%", caseSensitive: false));
            })
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->limit(self::MAX_LISTINGS)
            ->get();

        // in_stock en 1 query: el panel muestra por qué un listing no sale
        // en la tienda ("Sin stock — oculto"). Mismo criterio SellableStock
        // que usa el catálogo público para ocultar agotados.
        $inStock = SellableStock::inStockMap($listings->pluck('product_id')->all());

        return $this->success(
            $listings
                ->map(fn (UsListing $l) => $this->formatListing($l, isset($inStock[$l->product_id])))
                ->values()
        );
    }

    /**
     * POST /us/listings
     * Publica un producto existente del POS en la tienda US.
     * Body: { product_id, name, description?, price_usd, category, visible?, image_url? }
     */
    public function store(Request $request): JsonResponse
    {
        if ($resp = $this->adminOnlyError()) {
            return $resp;
        }

        $data = $request->validate([
            'product_id'  => ['required', 'integer', 'exists:products,id'],
            // name/category opcionales: la UI del POS puede omitirlos —
            // name cae al nombre del producto y category a 'other'.
            'name'        => ['nullable', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:5000'],
            'price_usd'   => ['required', 'numeric', 'min:0', 'max:99999999'],
            'category'    => ['nullable', Rule::in(UsListing::CATEGORIES)],
            'image_url'   => ['nullable', 'string', 'max:500'],
            'visible'     => ['nullable', 'boolean'],
        ]);

        // 422 claro en duplicado (product_id es unique en la tabla).
        if (UsListing::where('product_id', $data['product_id'])->exists()) {
            return $this->error('Este producto ya está publicado en TadaimaUS.', 422);
        }

        $product = Product::findOrFail($data['product_id']);

        $listing = UsListing::create([
            'product_id'  => $data['product_id'],
            'name'        => ($data['name'] ?? null) !== null && trim($data['name']) !== ''
                ? $data['name']
                : $product->name,
            'description' => $data['description'] ?? null,
            'price_usd'   => $data['price_usd'],
            'category'    => $data['category'] ?? 'other',
            'image_url'   => $data['image_url'] ?? null,
            'visible'     => $data['visible'] ?? true,
        ]);

        $listing->load('product.images');

        return $this->success(
            $this->formatListing($listing, $this->productHasStock($listing)),
            'Producto publicado en TadaimaUS.',
            201
        );
    }

    /**
     * PUT /us/listings/{usListing} — campos opcionales.
     * Editar el listing NO toca pedidos existentes (snapshot en us_order_items).
     */
    public function update(Request $request, UsListing $usListing): JsonResponse
    {
        if ($resp = $this->adminOnlyError()) {
            return $resp;
        }

        $data = $request->validate([
            // name null/"" = volver al nombre del producto del POS.
            'name'        => ['sometimes', 'nullable', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:5000'],
            'price_usd'   => ['sometimes', 'numeric', 'min:0', 'max:99999999'],
            'category'    => ['sometimes', Rule::in(UsListing::CATEGORIES)],
            'image_url'   => ['nullable', 'string', 'max:500'],
            'visible'     => ['sometimes', 'boolean'],
        ]);

        if (array_key_exists('name', $data) && ($data['name'] === null || trim($data['name']) === '')) {
            $data['name'] = $usListing->product?->name ?? $usListing->name;
        }

        $usListing->update($data);
        $usListing->load('product.images');

        return $this->success(
            $this->formatListing($usListing, $this->productHasStock($usListing)),
            'Listing actualizado.'
        );
    }

    /**
     * DELETE /us/listings/{usListing}
     * Despublica de la tienda US. Los pedidos ya creados conservan su snapshot.
     */
    public function destroy(UsListing $usListing): JsonResponse
    {
        if ($resp = $this->adminOnlyError()) {
            return $resp;
        }

        $usListing->delete();

        return $this->success(null, 'Producto quitado de TadaimaUS.');
    }

    /**
     * GET /us/products?search=
     * Buscador del ABC: productos ACTIVOS del POS aún NO listados en la
     * tienda US. Payload { id, name, sku, image_url, price_a } (cap 50).
     */
    public function products(Request $request): JsonResponse
    {
        if ($resp = $this->adminOnlyError()) {
            return $resp;
        }

        $products = Product::query()
            ->active()
            ->whereNotIn('id', UsListing::query()->select('product_id'))
            ->with(['images', 'price'])
            ->when($request->filled('search'), fn ($q) => $q
                ->search(trim((string) $request->input('search'))))
            ->orderBy('name')
            ->limit(self::MAX_PRODUCTS)
            ->get();

        return $this->success($products->map(fn (Product $p) => [
            'id'        => $p->id,
            'name'      => $p->name,
            'sku'       => $p->sku,
            'image_url' => $this->productImageUrl($p),
            'price_a'   => $p->price?->price_1,
        ])->values());
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    private function formatListing(UsListing $l, bool $inStock): array
    {
        $p = $l->product;

        return [
            'id'          => $l->id,
            'product_id'  => $l->product_id,
            'name'        => $l->name,
            'description' => $l->description,
            'price_usd'   => number_format((float) $l->price_usd, 2, '.', ''),
            'category'    => $l->category,
            // Con fallback a la foto del producto (contrato).
            'image_url'   => $l->resolvedImageUrl(),
            'visible'     => (bool) $l->visible,
            // Sin stock vendible ⇒ el catálogo público lo oculta aunque
            // visible=true — el panel lo señala ("Sin stock — oculto").
            'in_stock'    => $inStock,
            'created_at'  => $l->created_at?->toISOString(),
            'updated_at'  => $l->updated_at?->toISOString(),
            'product'     => $p ? [
                'id'   => $p->id,
                'name' => $p->name,
                'sku'  => $p->sku,
            ] : null,
        ];
    }

    /** Stock vendible del producto de UN listing (para store/update). */
    private function productHasStock(UsListing $l): bool
    {
        return SellableStock::inStockMap([$l->product_id]) !== [];
    }

    /** Primera foto del producto (accessor `url` de ProductImage) o null. */
    private function productImageUrl(Product $p): ?string
    {
        $url = $p->images->first()?->url;

        return ($url !== null && $url !== '') ? $url : null;
    }
}
