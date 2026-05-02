<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CashMovement extends Model
{
    public $timestamps = false;

    const TYPES = ['entrada', 'salida', 'ajuste'];

    protected $table = 'cash_movements';

    protected $fillable = [
        'register_session_id', 'type', 'amount', 'description',
    ];

    protected $casts = [
        'amount'     => 'float',
        'created_at' => 'datetime',
    ];

    protected static function booted(): void
    {
        static::creating(static fn ($m) => $m->created_at ??= now());
    }

    public function session(): BelongsTo
    {
        return $this->belongsTo(CashRegisterSession::class, 'register_session_id');
    }
}
