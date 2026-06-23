<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Sale extends Model
{
    public $timestamps = false;

    const STATUS_COMPLETED = 'completed';
    const STATUS_CANCELLED = 'cancelled';
    const STATUS_RETURNED  = 'returned';

    const CANCELLATION_NONE    = 'none';
    const CANCELLATION_PARTIAL = 'partial';
    const CANCELLATION_FULL    = 'full';

    protected $fillable = [
        'store_id',
        'register_session_id',
        'user_id',
        'customer_id',
        'terminal_id',
        'draft_id',
        'subtotal',
        'discount',
        'total',
        'commission_amount',
        'cash_received_usd',
        'exchange_rate',
        'cash_received',
        'change_amount',
        'status',
        'cancellation_status',
        'last_cancelled_at',
    ];

    protected $casts = [
        'subtotal'           => 'float',
        'discount'           => 'float',
        'total'              => 'float',
        'commission_amount'  => 'float',
        'cash_received_usd'  => 'float',
        'exchange_rate'      => 'float',
        'cash_received'      => 'float',
        'change_amount'      => 'float',
        'sold_at'            => 'datetime',
        'created_at'         => 'datetime',
        'last_cancelled_at'  => 'datetime',
    ];

    protected static function booted(): void
    {
        static::creating(static function (self $sale): void {
            $sale->sold_at    ??= now();
            $sale->created_at ??= now();
            $sale->status     ??= self::STATUS_COMPLETED;
        });
    }

    // ─── Relations ────────────────────────────────────────────────────────────

    public function items(): HasMany
    {
        return $this->hasMany(SaleItem::class);
    }

    public function cancellations(): HasMany
    {
        return $this->hasMany(SaleCancellation::class);
    }

    public function payments(): HasMany
    {
        return $this->hasMany(Payment::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(Customer::class);
    }

    /**
     * Preventas creadas en la MISMA transacción de checkout (cobro mixto).
     * Cuando el cajero cobra regular + anticipo de nueva preventa en un solo
     * ticket, ese anticipo va a `pre_sale_orders` con `linked_sale_id = sale.id`.
     * Esto permite que el ticket "padre" muestre el desglose completo:
     *   sale (regulares + liquidaciones) + pre_sale_orders[] (anticipos nuevos).
     */
    public function preSaleOrders(): HasMany
    {
        return $this->hasMany(\App\Models\PreSaleOrder::class, 'linked_sale_id');
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function draft(): BelongsTo
    {
        return $this->belongsTo(SalesDraft::class, 'draft_id');
    }
}
