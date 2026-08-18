<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;

class Product extends Model
{
    public const TYPE_PRODUCT = 'product';

    public const TYPE_MANGA = 'manga';

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
        'cost' => 'float',
        'active' => 'boolean',
        'featured' => 'boolean',
        'catalog_visible' => 'boolean',
        'catalog_position' => 'integer',
    ];

    protected $attributes = [
        'product_type' => self::TYPE_PRODUCT,
    ];

    // ─── Relations ────────────────────────────────────────────────────────────

    /**
     * Categoría "caché" (compat). Desde 2026-08-17 un producto tiene N
     * categorías en `categories()`; `category_id` se mantiene = la primera del
     * pivote (por position) SOLO para consumidores legacy (light resource,
     * app móvil, SQL crudo). No tiene significado de "principal" en la UI.
     * Escribir SIEMPRE vía syncCategories(), nunca category_id directo.
     */
    public function category(): BelongsTo
    {
        return $this->belongsTo(ProductCategory::class, 'category_id');
    }

    /** Todas las categorías del producto (fuente de verdad, sin principal). */
    public function categories(): BelongsToMany
    {
        return $this->belongsToMany(ProductCategory::class, 'product_category_assignments', 'product_id', 'category_id')
            ->withPivot('position')
            ->withTimestamps()
            ->orderBy('product_category_assignments.position')
            ->orderBy('product_categories.name');
    }

    /**
     * Único punto de escritura de categorías: sincroniza el pivote (con
     * position = orden recibido) y la caché `category_id` (= la primera, o
     * NULL si queda sin categorías). Ids duplicados/no numéricos se descartan.
     *
     * @param  array<int, int|string>  $categoryIds
     */
    public function syncCategories(array $categoryIds): void
    {
        $ids = array_values(array_unique(array_map('intval', array_filter($categoryIds, fn ($v) => $v !== null && $v !== ''))));
        $sync = [];
        foreach ($ids as $i => $id) {
            $sync[$id] = ['position' => $i];
        }
        $this->categories()->sync($sync);
        $first = $ids[0] ?? null;
        if ((int) ($this->category_id ?? 0) !== (int) ($first ?? 0)) {
            $this->forceFill(['category_id' => $first])->saveQuietly();
        }
        $this->unsetRelation('categories');
        $this->unsetRelation('category');
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

    /**
     * Promos ASIGNADAS a este producto (promos generales 2026-07-25): la
     * relación pasa de HasMany por product_id al pivote de asignaciones. Los
     * eager-loads y Resources existentes no cambian — la colección trae los
     * mismos modelos con los mismos campos (el shape del embed queda intacto).
     */
    public function promotions(): BelongsToMany
    {
        return $this->belongsToMany(
            ProductPromotion::class,
            'product_promotion_assignments',
            'product_id',
            'promotion_id',
        )->withTimestamps();
    }

    /** Promos vigentes AHORA (para el payload de Caja / motor NxM). */
    public function activePromotions(): BelongsToMany
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

        // whereLike(caseSensitive: false) → ILIKE en Postgres (acelerado por los
        // índices trigram de 2026_07_31_000001); en MySQL/SQLite queda LIKE de
        // siempre. Sin esto, en Postgres "naruto" no encontraría "Naruto"
        // (LIKE es case-sensitive ahí; el collation _ci de MySQL no).
        return $query->where(function (Builder $q) use ($term) {
            $q->whereLike('name', "%{$term}%", caseSensitive: false)
                ->orWhereLike('sku', "%{$term}%", caseSensitive: false)
                ->orWhereLike('barcode', "%{$term}%", caseSensitive: false);
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
        $expr = array_map(static fn (string $t) => $t === '' ? '' : '+'.$t.'*', $tokens);

        return implode(' ', array_filter($expr));
    }
}
