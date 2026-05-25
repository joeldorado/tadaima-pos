<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

class CashRegisterSession extends Model
{
    public $timestamps = false;

    const STATUS_OPEN   = 'open';
    const STATUS_CLOSED = 'closed';

    protected $table = 'cash_register_sessions';

    protected $fillable = [
        'register_id', 'user_id', 'opened_at', 'closed_at',
        'opening_cash', 'closing_cash', 'status',
    ];

    protected $casts = [
        'opened_at'    => 'datetime',
        'closed_at'    => 'datetime',
        'opening_cash' => 'float',
        'closing_cash' => 'float',
    ];

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
