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

    protected $fillable = [
        'product_id',
        'name',
        'buy_n',
        'pay_m',
        'starts_at',
        'ends_at',
        'status',
        'priority',
    ];

    protected $casts = [
        'buy_n'     => 'integer',
        'pay_m'     => 'integer',
        'priority'  => 'integer',
        'starts_at' => 'datetime',
        'ends_at'   => 'datetime',
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
}
