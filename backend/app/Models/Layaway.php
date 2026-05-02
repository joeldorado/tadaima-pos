<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Layaway extends Model
{
    const STATUS_ACTIVE    = 'active';
    const STATUS_PAID      = 'paid';
    const STATUS_DELIVERED = 'delivered';
    const STATUS_CANCELLED = 'cancelled';
    const STATUS_EXPIRED   = 'expired';

    const OPEN_STATUSES = [self::STATUS_ACTIVE, self::STATUS_PAID];

    protected $fillable = [
        'code', 'store_id', 'user_id', 'customer_id', 'product_id',
        'warehouse_id', 'quantity', 'price', 'total', 'down_payment',
        'status', 'expires_at', 'notes',
    ];

    protected $casts = [
        'quantity'     => 'integer',
        'price'        => 'float',
        'total'        => 'float',
        'down_payment' => 'float',
        'expires_at'   => 'date:Y-m-d',
    ];

    // ── Relations ─────────────────────────────────────────────────────────────

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }

    public function payments(): HasMany
    {
        return $this->hasMany(LayawayPayment::class)->latest('created_at');
    }

    public function logs(): HasMany
    {
        return $this->hasMany(LayawayLog::class)->latest('created_at');
    }

    // ── Computed ──────────────────────────────────────────────────────────────

    public function getPaidAmountAttribute(): float
    {
        return round($this->payments->sum('amount'), 2);
    }

    public function getBalanceAttribute(): float
    {
        return round($this->total - $this->paid_amount, 2);
    }

    // ── Scopes ────────────────────────────────────────────────────────────────

    public function scopeOpen($query)
    {
        return $query->whereIn('status', self::OPEN_STATUSES);
    }
}
