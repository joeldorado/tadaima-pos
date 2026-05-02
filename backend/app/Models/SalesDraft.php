<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SalesDraft extends Model
{
    // Límite de drafts activos por usuario (ADR-003)
    const MAX_OPEN = 5;

    const STATUS_OPEN      = 'open';
    const STATUS_SUSPENDED = 'suspended';
    const STATUS_COMPLETED = 'completed';
    const STATUS_CANCELLED = 'cancelled';

    protected $table = 'sales_drafts';

    protected $fillable = [
        'store_id',
        'register_session_id',
        'user_id',
        'customer_id',
        'status',
    ];

    protected $casts = ['status' => 'string'];

    // ─── Relations ────────────────────────────────────────────────────────────

    public function items(): HasMany
    {
        return $this->hasMany(SalesDraftItem::class, 'draft_id')->with('product');
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

    // ─── Computed ─────────────────────────────────────────────────────────────

    /**
     * Subtotal calculado en base a los ítems cargados en memoria.
     * Usar después de ->load('items') o ->with('items').
     */
    public function getSubtotalAttribute(): float
    {
        return (float) $this->items->sum('total');
    }

    // ─── Scopes ───────────────────────────────────────────────────────────────

    /** Drafts operativos (open o suspended) */
    public function scopeActive(Builder $q): Builder
    {
        return $q->whereIn('status', [self::STATUS_OPEN, self::STATUS_SUSPENDED]);
    }
}
