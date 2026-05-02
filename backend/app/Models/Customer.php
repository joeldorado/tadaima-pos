<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Customer extends Model
{
    protected $fillable = [
        'external_member_id',
        'name',
        'phone',
        'email',
        'address',
        'notes',
        'loyalty_tier',
        'points',
    ];

    protected $casts = ['points' => 'integer'];

    // ─── Relations ────────────────────────────────────────────────────────────

    public function credit(): HasMany
    {
        return $this->hasMany(CustomerCredit::class);
    }

    public function layaways(): HasMany
    {
        return $this->hasMany(Layaway::class);
    }

    // ─── Scopes ───────────────────────────────────────────────────────────────

    public function scopeSearch(Builder $query, string $term): Builder
    {
        return $query->where(function (Builder $q) use ($term) {
            $q->where('name', 'like', "%{$term}%")
              ->orWhere('email', 'like', "%{$term}%")
              ->orWhere('phone', 'like', "%{$term}%")
              ->orWhere('external_member_id', 'like', "%{$term}%");
        });
    }

    // ─── Computed ─────────────────────────────────────────────────────────────

    /**
     * Saldo a favor acumulado (suma de customer_credit).
     * Distinto de loyalty points.
     */
    public function getCreditBalanceAttribute(): float
    {
        return (float) ($this->credit_sum_amount ?? 0);
    }
}
