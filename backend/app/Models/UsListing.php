<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * TadaimaUS — producto del POS publicado en la tienda US con precio en USD.
 * El listing tiene nombre/descripción propios (inglés); image_url null =
 * fallback a la primera foto del producto en los payloads.
 */
class UsListing extends Model
{
    public const CATEGORY_FIGURES = 'figures';
    public const CATEGORY_MANGA   = 'manga';
    public const CATEGORY_TCG     = 'tcg';
    public const CATEGORY_OTHER   = 'other';

    public const CATEGORIES = [
        self::CATEGORY_FIGURES,
        self::CATEGORY_MANGA,
        self::CATEGORY_TCG,
        self::CATEGORY_OTHER,
    ];

    protected $fillable = [
        'product_id', 'name', 'description', 'price_usd',
        'category', 'image_url', 'visible',
    ];

    protected $casts = [
        'price_usd' => 'float',
        'visible'   => 'boolean',
    ];

    // ── Relations ─────────────────────────────────────────────────────────────

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    // ── Computed ──────────────────────────────────────────────────────────────

    /**
     * Imagen que ve el cliente US: la del listing o, si es null, la primera
     * foto del producto del POS. Cargar `product.images` antes (evita N+1).
     */
    public function resolvedImageUrl(): ?string
    {
        if ($this->image_url) {
            return $this->image_url;
        }

        $url = $this->product?->images->first()?->url;

        return ($url !== null && $url !== '') ? $url : null;
    }
}
