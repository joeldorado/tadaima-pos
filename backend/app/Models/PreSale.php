<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class PreSale extends Model
{
    const STATUS_LIVE      = 'live';
    const STATUS_READY     = 'ready';
    const STATUS_COMPLETED = 'completed';
    const STATUS_EXPIRED   = 'expired';
    const STATUS_CANCELLED = 'cancelled';
    const STATUS_PAUSED    = 'paused';

    const ACTIVE_STATUSES = [self::STATUS_LIVE, self::STATUS_READY];
    const EDITABLE_STATUSES = [self::STATUS_LIVE, self::STATUS_READY, self::STATUS_PAUSED];

    protected $fillable = [
        'store_id', 'user_id', 'customer_id', 'code',
        'product_name', 'advance_payment', 'preorder_limit',
        'reserved_quantity', 'pickup_deadline', 'status',
        'cost', 'margin_percent',
        'category_id', 'supplier_id',
        'price_1', 'price_2', 'price_3', 'price_4', 'price_5',
        'arrival_date', 'inventory_pushed', 'linked_sale_id', 'product_id',
        'image_path',
    ];

    protected $casts = [
        'advance_payment'   => 'float',
        'preorder_limit'    => 'integer',
        'reserved_quantity' => 'integer',
        'pickup_deadline'   => 'date:Y-m-d',
        'arrival_date'      => 'date:Y-m-d',
        'inventory_pushed'  => 'boolean',
        'cost'              => 'float',
        'margin_percent'    => 'float',
        'price_1'           => 'float',
        'price_2'           => 'float',
        'price_3'           => 'float',
        'price_4'           => 'float',
        'price_5'           => 'float',
    ];

    public function items(): HasMany
    {
        return $this->hasMany(PreSaleItem::class);
    }

    public function payments(): HasMany
    {
        return $this->hasMany(PreSalePayment::class);
    }

    public function logs(): HasMany
    {
        return $this->hasMany(PreSaleLog::class)->latest('created_at');
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function category(): BelongsTo
    {
        return $this->belongsTo(\App\Models\ProductCategory::class);
    }

    public function supplier(): BelongsTo
    {
        return $this->belongsTo(Supplier::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    // ── Computed (require relations loaded) ───────────────────────────────────

    public function getTotalAttribute(): float
    {
        return round($this->items->sum(fn ($i) => $i->quantity * $i->price), 2);
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

    public function scopeActive($query)
    {
        return $query->whereIn('status', self::ACTIVE_STATUSES);
    }
}
