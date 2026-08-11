<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\UsListing;
use App\Support\SellableStock;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * TadaimaUS — catálogo PÚBLICO de la tienda US (tadaimaus.com).
 * Sin auth; el throttling vive en routes/api.php.
 */
class UsCatalogController extends Controller
{
    /** Cap duro del catálogo público (contrato: sin paginación). */
    private const MAX_ITEMS = 200;

    /**
     * GET /us/catalog?category=&search=
     *
     * Solo listings visible=true Y con stock vendible (decisión de Joel:
     * producto publicado se OCULTA si se agota — mismo criterio SellableStock
     * que el catálogo MX). Los listings CUSTOM (product_id null: migrados del
     * Wix o dummy del panel) no tienen stock POS — salen siempre que estén
     * visibles. Filtros: category (figures|manga|tcg|other) y search
     * (nombre/descripción del listing). Orden created_at desc, cap 200.
     * image_url del listing con fallback a la foto del producto.
     */
    public function catalog(Request $request): JsonResponse
    {
        $listings = UsListing::query()
            ->with('product.images')
            ->where('visible', true)
            ->where(fn ($q) => $q
                ->whereNull('us_listings.product_id')
                ->orWhereExists(SellableStock::existsClosure('us_listings.product_id')))
            ->when($request->filled('category'), fn ($q) => $q
                ->where('category', $request->input('category')))
            ->when($request->filled('search'), function ($q) use ($request) {
                $term = trim((string) $request->input('search'));
                $q->where(fn ($w) => $w
                    ->whereLike('name', "%{$term}%", caseSensitive: false)
                    ->orWhereLike('description', "%{$term}%", caseSensitive: false));
            })
            ->orderByDesc('created_at')
            ->orderByDesc('id') // tiebreak estable
            ->limit(self::MAX_ITEMS)
            ->get();

        return $this->success($listings->map(fn (UsListing $l) => [
            'id'          => $l->id,
            'name'        => $l->name,
            'description' => $l->description,
            'price_usd'   => number_format((float) $l->price_usd, 2, '.', ''),
            'image_url'   => $l->resolvedImageUrl(),
            'category'    => $l->category,
        ])->values());
    }
}
