<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PreSaleOrder extends Model
{
    const STATUS_PENDING   = 'pending';
    const STATUS_READY     = 'ready';
    const STATUS_DELIVERED = 'delivered';
    const STATUS_EXPIRED   = 'expired';
    const STATUS_CANCELLED = 'cancelled';

    const OPEN_STATUSES = [self::STATUS_PENDING, self::STATUS_READY];

    const CANCELLATION_NONE    = 'none';
    const CANCELLATION_PARTIAL = 'partial';
    const CANCELLATION_FULL    = 'full';

    protected $fillable = [
        'code', 'store_id', 'linked_sale_id', 'user_id', 'customer_id',
        'status', 'pickup_deadline', 'notes',
        'cancellation_status', 'last_cancelled_at',
    ];

    protected $casts = [
        'pickup_deadline'   => 'date:Y-m-d',
        'last_cancelled_at' => 'datetime',
    ];

    // ── Relations ─────────────────────────────────────────────────────────────

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function linkedSale(): BelongsTo
    {
        return $this->belongsTo(Sale::class, 'linked_sale_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function items(): HasMany
    {
        return $this->hasMany(PreSaleOrderItem::class);
    }

    public function payments(): HasMany
    {
        return $this->hasMany(PreSaleOrderPayment::class)->latest('created_at');
    }

    public function cancellations(): HasMany
    {
        return $this->hasMany(SaleCancellation::class);
    }

    public function logs(): HasMany
    {
        return $this->hasMany(PreSaleOrderLog::class)->latest('created_at');
    }

    // ── Computed (require relations loaded) ───────────────────────────────────

    public function getTotalAttribute(): float
    {
        return round($this->items->sum(fn ($i) => $i->quantity * $i->unit_price), 2);
    }

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

    public function scopeForStore($query, int $storeId)
    {
        return $query->where('store_id', $storeId);
    }
}
