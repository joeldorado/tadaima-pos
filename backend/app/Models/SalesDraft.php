<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class SalesDraft extends Model
{
    // Límite de drafts activos por usuario (ADR-003)
    // Subido de 5 → 10 para soportar cajeros con varios clientes en paralelo
    // (mostrador + celular). Cleanup automático evita que drafts huérfanos saturen.
    const MAX_OPEN = 10;

    // TTL para cleanup automático (en horas)
    const STALE_HOURS_EMPTY = 0.5; // drafts sin items > 30 min → cancelar
    const STALE_HOURS_WITH_ITEMS = 6; // drafts con items > 6 h → cancelar

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

    /**
     * Drafts huérfanos candidatos a cleanup:
     *   - Sin items y >30 min de creados
     *   - Con items y >6 h sin actualizar
     */
    public function scopeStale(Builder $q): Builder
    {
        $emptyCutoff = now()->subMinutes((int) (self::STALE_HOURS_EMPTY * 60));
        $withItemsCutoff = now()->subHours((int) self::STALE_HOURS_WITH_ITEMS);

        return $q->active()
            ->where(function (Builder $sub) use ($emptyCutoff, $withItemsCutoff) {
                $sub->where(function (Builder $a) use ($emptyCutoff) {
                    $a->whereDoesntHave('items')->where('created_at', '<', $emptyCutoff);
                })->orWhere(function (Builder $b) use ($withItemsCutoff) {
                    $b->whereHas('items')->where('updated_at', '<', $withItemsCutoff);
                });
            });
    }
}
