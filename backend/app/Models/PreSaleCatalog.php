<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use App\Models\PreSaleOrder;

class PreSaleCatalog extends Model
{
    const STATUS_DRAFT      = 'draft';
    const STATUS_PUBLISHED  = 'published';
    const STATUS_ARRIVED    = 'arrived';
    const STATUS_CLOSED     = 'closed';
    const STATUS_CANCELLED  = 'cancelled';
    const STATUS_COMPLETED  = 'completed';

    const ACTIVE_STATUSES = [self::STATUS_PUBLISHED, self::STATUS_ARRIVED];

    protected $fillable = [
        'category_id', 'supplier_id', 'product_id', 'created_by',
        'product_name', 'image_path',
        'cost', 'margin_percent',
        'price_1', 'price_2', 'price_3', 'price_4', 'price_5',
        'advance_payment', 'preorder_limit',
        'arrival_date', 'pickup_deadline',
        'status',
    ];

    protected $casts = [
        'cost'            => 'float',
        'margin_percent'  => 'float',
        'price_1'         => 'float',
        'price_2'         => 'float',
        'price_3'         => 'float',
        'price_4'         => 'float',
        'price_5'         => 'float',
        'advance_payment' => 'float',
        'preorder_limit'  => 'integer',
        'arrival_date'    => 'date:Y-m-d',
        'pickup_deadline' => 'date:Y-m-d',
    ];

    // ── Relations ─────────────────────────────────────────────────────────────

    public function category(): BelongsTo
    {
        return $this->belongsTo(ProductCategory::class);
    }

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function createdBy(): BelongsTo
    {
        return $this->belongsTo(User::class, 'created_by');
    }

    public function orderItems(): HasMany
    {
        return $this->hasMany(PreSaleOrderItem::class, 'pre_sale_catalog_id');
    }

    /** Stock de preventa por tienda. Whitelist obligatoria — sin entrada, esa tienda no vende. */
    public function storeLimits(): HasMany
    {
        return $this->hasMany(PreSaleCatalogStoreLimit::class, 'catalog_id');
    }

    /**
     * Retorna el stock de preventa disponible para la tienda dada.
     *
     * Decisión Joel 2026-05-20: `store_limits` es la única fuente de verdad.
     * Antes existía un fallback al `preorder_limit` global cuando la tabla
     * estaba vacía — eso convertía cualquier catálogo sin tiendas en "se
     * vende en todas las tiendas" sin querer. Ahora:
     *
     *  1. store_limits incluye esta tienda → su limit_qty.
     *  2. store_limits NO incluye esta tienda (o está vacío) → 0 (no se vende).
     *
     * Si el admin quiere vender en varias tiendas debe agregar una entrada
     * por cada una en el tab "Stock" del catálogo.
     *
     * `preorder_limit` queda en el modelo por compatibilidad histórica pero
     * deja de afectar la disponibilidad por tienda. Pendiente revisar su uso
     * como "límite por cliente" — ver entrada del MASTERLOG 2026-05-20.
     */
    public function limitForStore(int $storeId): int
    {
        $limits = $this->relationLoaded('storeLimits') ? $this->storeLimits : $this->storeLimits()->get();
        $row = $limits->firstWhere('store_id', $storeId);
        return $row ? (int) $row->limit_qty : 0;
    }

    /**
     * Cantidad ya reservada/activa POR TIENDA (pending + ready).
     * Usado en CatalogCard de Caja y en validación de createOrder.
     */
    public function reservedCountForStore(int $storeId): int
    {
        return (int) $this->orderItems()
            ->whereHas('order', fn ($q) => $q
                ->whereIn('status', [PreSaleOrder::STATUS_PENDING, PreSaleOrder::STATUS_READY])
                ->where('store_id', $storeId)
            )
            ->sum('quantity');
    }

    /** Items belonging to active (pending or ready) orders only. */
    public function activeOrderItems(): HasMany
    {
        return $this->hasMany(PreSaleOrderItem::class, 'pre_sale_catalog_id')
            ->whereHas('order', fn ($q) => $q->whereIn('status', [
                PreSaleOrder::STATUS_PENDING,
                PreSaleOrder::STATUS_READY,
            ]));
    }

    /** Items belonging to all non-cancelled orders (including delivered). */
    public function soldOrderItems(): HasMany
    {
        return $this->hasMany(PreSaleOrderItem::class, 'pre_sale_catalog_id')
            ->whereHas('order', fn ($q) => $q->where('status', '!=', PreSaleOrder::STATUS_CANCELLED));
    }

    /** Items belonging to delivered orders only. */
    public function deliveredOrderItems(): HasMany
    {
        return $this->hasMany(PreSaleOrderItem::class, 'pre_sale_catalog_id')
            ->whereHas('order', fn ($q) => $q->where('status', PreSaleOrder::STATUS_DELIVERED));
    }

    // ── Computed ──────────────────────────────────────────────────────────────

    public function getReservedCountAttribute(): int
    {
        return (int) $this->activeOrderItems->sum('quantity');
    }

    public function getSoldCountAttribute(): int
    {
        return (int) $this->soldOrderItems->sum('quantity');
    }

    public function getDeliveredCountAttribute(): int
    {
        return (int) $this->deliveredOrderItems->sum('quantity');
    }

    // ── Scopes ────────────────────────────────────────────────────────────────

    public function scopePublished($query)
    {
        return $query->where('status', self::STATUS_PUBLISHED);
    }
}
