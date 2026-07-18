<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Product extends Model
{
    public const TYPE_PRODUCT = 'product';
    public const TYPE_MANGA   = 'manga';

    protected $fillable = [
        'category_id',
        'supplier_id',
        'name',
        'sku',
        'barcode',
        'description',
        'cost',
        'active',
        'product_type',
        'featured',
        'catalog_visible',
    ];

    // `catalog_position` (top manual del catálogo, v5) NO va en $fillable a
    // propósito: solo se escribe por query builder (reorderFeatured) y por
    // forceFill, así ningún update($request->validated()) futuro la toca por
    // accidente.
    protected $casts = [
        'cost'             => 'float',
        'active'           => 'boolean',
        'featured'         => 'boolean',
        'catalog_visible'  => 'boolean',
        'catalog_position' => 'integer',
    ];

    protected $attributes = [
        'product_type' => self::TYPE_PRODUCT,
    ];

    // ─── Relations ────────────────────────────────────────────────────────────

    public function category(): BelongsTo
    {
        return $this->belongsTo(ProductCategory::class, 'category_id');
    }

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class, 'supplier_id');
    }

    public function price(): HasOne
    {
        return $this->hasOne(ProductPrice::class);
    }

    public function images(): HasMany
    {
        return $this->hasMany(ProductImage::class)->orderBy('sort_order');
    }

    public function paymentMethod(): HasOne
    {
        return $this->hasOne(ProductPaymentMethod::class);
    }

    public function promotions(): HasMany
    {
        return $this->hasMany(ProductPromotion::class);
    }

    /** Promos vigentes AHORA (para el payload de Caja / motor NxM). */
    public function activePromotions(): HasMany
    {
        return $this->promotions()->currentlyActive();
    }

    public function inventory(): HasMany
    {
        return $this->hasMany(Inventory::class);
    }

    public function layaways(): HasMany
    {
        return $this->hasMany(Layaway::class);
    }

    public function saleItems(): HasMany
    {
        return $this->hasMany(SaleItem::class);
    }

    public function storePrices(): HasMany
    {
        return $this->hasMany(ProductStorePrice::class)->orderBy('store_id')->orderBy('price_level');
    }

    /**
     * Extensión específica para mangas (volume, editorial, genre). Solo tiene
     * fila cuando product_type='manga'. Para productos regulares retorna null.
     */
    public function mangaDetails(): HasOne
    {
        return $this->hasOne(ProductMangaDetail::class);
    }

    // ─── Scopes ───────────────────────────────────────────────────────────────

    public function scopeActive(Builder $query): Builder
    {
        return $query->where('active', true);
    }

    public function scopeOfType(Builder $query, string $type): Builder
    {
        return $query->where('product_type', $type);
    }

    public function scopeSearch(Builder $query, string $term): Builder
    {
        $term = trim($term);
        if ($term === '') {
            return $query;
        }

        // FULLTEXT MATCH AGAINST (BOOLEAN MODE) requires the term to be at
        // least innodb_ft_min_token_size chars (default 3). For shorter
        // terms (e.g. 2-char SKU prefixes), fall back to LIKE prefix match
        // which still hits the per-column index on sku/barcode.
        $driver = $query->getConnection()->getDriverName();
        if ($driver === 'mysql' && mb_strlen($term) >= 3) {
            $boolean = $this->buildFulltextBooleanTerm($term);
            return $query->whereRaw(
                'MATCH(name, sku, barcode) AGAINST(? IN BOOLEAN MODE)',
                [$boolean]
            );
        }

        return $query->where(function (Builder $q) use ($term) {
            $q->where('name', 'like', "%{$term}%")
              ->orWhere('sku', 'like', "%{$term}%")
              ->orWhere('barcode', 'like', "%{$term}%");
        });
    }

    /**
     * Builds a BOOLEAN MODE search expression. Escapes the operator chars
     * MySQL FULLTEXT treats specially (+ - > < ( ) ~ * " @) and adds a
     * trailing * to each token so partial-word matches still work
     * ("iPho" matches "iPhone").
     */
    private function buildFulltextBooleanTerm(string $term): string
    {
        $sanitized = preg_replace('/[+\-><()~*"@]+/u', ' ', $term) ?? '';
        $tokens = preg_split('/\s+/u', trim($sanitized)) ?: [];
        $expr = array_map(static fn (string $t) => $t === '' ? '' : '+' . $t . '*', $tokens);
        return implode(' ', array_filter($expr));
    }
}
