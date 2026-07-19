<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProductPromotion extends Model
{
    public const STATUS_ACTIVE  = 'active';
    public const STATUS_PAUSED  = 'paused';
    public const STATUS_EXPIRED = 'expired';

    public const STATUSES = [
        self::STATUS_ACTIVE,
        self::STATUS_PAUSED,
        self::STATUS_EXPIRED,
    ];

    /** "Compra N, paga M" (2x1). Usa buy_n/pay_m. */
    public const TYPE_NXM = 'nxm';
    /**
     * MAYOREO: "desde N piezas, −$X a CADA UNA". Usa min_qty/discount_per_unit.
     *
     * El slug conserva el nombre viejo a propósito (no se renombra a 'mayoreo'):
     * evita migrar el `type` de las filas vivas y tocar las uniones TS que están
     * duplicadas en 4 archivos. Lo que cambió es la matemática, no el slug — la
     * semántica anterior era "−$X por cada grupo de N" con `tiers`.
     */
    public const TYPE_QTY_DISCOUNT = 'qty_discount';

    public const TYPES = [
        self::TYPE_NXM,
        self::TYPE_QTY_DISCOUNT,
    ];

    // `tiers` NO está en fillable a propósito (mayoreo, 2026-07-23): quedó como
    // rastro histórico de lo que la promo era antes del cambio de semántica y no
    // se vuelve a escribir. Que lo garantice el modelo, no la disciplina.
    protected $fillable = [
        'product_id',
        'store_id',
        'name',
        'type',
        'buy_n',
        'pay_m',
        'min_qty',
        'discount_per_unit',
        'starts_at',
        'ends_at',
        'status',
        'priority',
    ];

    protected $casts = [
        'store_id'          => 'integer',
        'buy_n'             => 'integer',
        'pay_m'             => 'integer',
        'min_qty'           => 'integer',
        'discount_per_unit' => 'float',
        'tiers'             => 'array',
        'priority'          => 'integer',
        'starts_at'         => 'datetime',
        'ends_at'           => 'datetime',
    ];

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    /**
     * Promos vigentes AHORA: status active + dentro de la ventana. La
     * expiración es lazy — una promo con ends_at pasado simplemente deja de
     * matchear este scope (sin cron).
     */
    public function scopeCurrentlyActive(Builder $query): Builder
    {
        return $query
            ->where('status', self::STATUS_ACTIVE)
            ->where(fn ($q) => $q->whereNull('starts_at')->orWhere('starts_at', '<=', now()))
            ->where(fn ($q) => $q->whereNull('ends_at')->orWhere('ends_at', '>=', now()));
    }

    /**
     * Promos aplicables en UNA tienda: store_id NULL (todas) o la tienda dada.
     * Scoping por tienda 2026-07-16 — el motor filtra por la tienda de la venta.
     */
    public function scopeForStore(Builder $query, ?int $storeId): Builder
    {
        if ($storeId === null) {
            return $query;
        }

        return $query->where(fn ($q) => $q->whereNull('store_id')->orWhere('store_id', $storeId));
    }
}
