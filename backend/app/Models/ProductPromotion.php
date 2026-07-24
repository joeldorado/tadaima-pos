<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

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
        'allow_cash',
        'allow_card',
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
        // Restricción de método de pago de la promo (espejo del producto).
        'allow_cash'        => 'boolean',
        'allow_card'        => 'boolean',
        'tiers'             => 'array',
        'priority'          => 'integer',
        'starts_at'         => 'datetime',
        'ends_at'           => 'datetime',
    ];

    /**
     * @deprecated Promos generales (2026-07-25): la relación real es products()
     *             vía el pivote. `product_id` quedó como rastro legacy — solo lo
     *             escriben el shim anidado (compat con PWA rezagada) y lo lee
     *             una revisión vieja de Cloud Run durante la ventana de rollout.
     */
    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    /** Productos a los que esta promo está asignada (promos generales). */
    public function products(): BelongsToMany
    {
        return $this->belongsToMany(
            Product::class,
            'product_promotion_assignments',
            'promotion_id',
            'product_id',
        )->withTimestamps();
    }

    /**
     * Puente legacy→asignaciones: crear una promo CON `product_id` (shim
     * anidado, fixtures de tests, cualquier código rezagado) la asigna sola al
     * pivote. Garantiza el invariante "product_id puesto ⇒ asignación existe"
     * sin depender de disciplina — es el espejo en vivo del backfill 000003.
     * Se retira junto con la columna legacy.
     */
    protected static function booted(): void
    {
        static::created(function (self $promotion) {
            if ($promotion->product_id !== null) {
                $promotion->products()->syncWithoutDetaching([(int) $promotion->product_id]);
            }
        });
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
