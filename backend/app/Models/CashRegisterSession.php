<?php

namespace App\Models;

use Carbon\CarbonInterface;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CashRegisterSession extends Model
{
    public $timestamps = false;

    const STATUS_OPEN   = 'open';
    const STATUS_CLOSED = 'closed';
    const STALE_AFTER_HOURS = 12;

    protected $table = 'cash_register_sessions';

    protected $fillable = [
        'register_id', 'user_id', 'opened_at', 'closed_at', 'local_date',
        'opening_cash', 'closing_cash', 'closing_cash_usd', 'status',
    ];

    protected $casts = [
        'opened_at'        => 'datetime',
        'closed_at'        => 'datetime',
        'local_date'       => 'date:Y-m-d',
        'opening_cash'     => 'float',
        'closing_cash'     => 'float',
        'closing_cash_usd' => 'float',
    ];

    /**
     * Caja de un día de negocio anterior con 12 h o más abierta: no opera hasta hacer el
     * corte (`CASH_SESSION_STALE`). Devuelve cuándo abrió en hora del negocio, o null.
     */
    public function staleSince(): ?CarbonInterface
    {
        $tz = config('app.business_timezone', 'America/Tijuana');
        $openedLocal = $this->opened_at?->copy()->timezone($tz);
        if (! $openedLocal) {
            return null;
        }

        $isPrevBusinessDay = $openedLocal->toDateString() < now($tz)->toDateString();
        $isOldEnough = $this->opened_at->diffInHours(now()) >= self::STALE_AFTER_HOURS;

        return $isPrevBusinessDay && $isOldEnough ? $openedLocal : null;
    }

    public function register(): BelongsTo
    {
        return $this->belongsTo(CashRegister::class, 'register_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function movements(): HasMany
    {
        return $this->hasMany(CashMovement::class, 'register_session_id')->latest('created_at');
    }

    public function sales(): HasMany
    {
        return $this->hasMany(Sale::class, 'register_session_id');
    }

    // ── Computed (requiere movements cargados) ────────────────────────────────

    public function getBalanceAttribute(): float
    {
        $entradas = $this->movements->where('type', 'entrada')->sum('amount');
        $salidas  = $this->movements->where('type', 'salida')->sum('amount');

        return round($this->opening_cash + $entradas - $salidas, 2);
    }
}
