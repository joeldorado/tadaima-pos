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
        // Snapshot del socio Tadaima (Supabase, solo lectura). Ver migración
        // 2026_06_25_000001. member_level = nivel_membresia (ej. "b"), distinto
        // del tier de gamificación local (loyalty_tier).
        'member_status',
        'member_level',
        'member_expires_at',
        'member_debt',
        'member_synced_at',
    ];

    protected $casts = [
        'points'            => 'integer',
        'member_expires_at' => 'date',
        'member_debt'       => 'decimal:2',
        'member_synced_at'  => 'datetime',
    ];

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

    /**
     * IDs de clientes que representan a la MISMA persona, para conteos que no
     * deben burlarse con registros duplicados (ej. límite de preventa por
     * cliente). Coincide por: mismo id, O mismo socio Tadaima
     * (`external_member_id`), O mismo teléfono normalizado a 10 dígitos.
     *
     * @return array<int,int>
     */
    public function sameIdentityIds(): array
    {
        $ids = collect([$this->id]);

        if ($this->external_member_id) {
            $ids = $ids->merge(
                static::query()->where('external_member_id', $this->external_member_id)->pluck('id')
            );
        }

        $digits = preg_replace('/\D/', '', (string) $this->phone);
        if (strlen($digits) >= 10) {
            $last10 = substr($digits, -10);
            // El teléfono puede estar guardado con formatos distintos → comparamos
            // por dígitos en PHP (la tabla de clientes es chica, ≤ cientos).
            $matches = static::query()->whereNotNull('phone')->pluck('phone', 'id')
                ->filter(fn ($p) => substr(preg_replace('/\D/', '', (string) $p), -10) === $last10)
                ->keys();
            $ids = $ids->merge($matches);
        }

        return $ids->map(fn ($id) => (int) $id)->unique()->values()->all();
    }
}
