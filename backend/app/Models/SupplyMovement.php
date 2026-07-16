<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SupplyMovement extends Model
{
    /** Solo created_at (como cash_movements): un movimiento no se edita. */
    public $timestamps = false;

    public const TYPE_PURCHASE    = 'purchase';
    public const TYPE_CONSUMPTION = 'consumption';
    public const TYPE_ADJUSTMENT  = 'adjustment';

    public const TYPES = [
        self::TYPE_PURCHASE,
        self::TYPE_CONSUMPTION,
        self::TYPE_ADJUSTMENT,
    ];

    /** Origen del dinero de una COMPRA (NULL en consumo/ajuste: no aplica). */
    public const SOURCE_CAJA       = 'caja';
    public const SOURCE_CAJA_CHICA = 'caja_chica';
    public const SOURCE_PROPIO     = 'propio';

    public const SOURCES = [
        self::SOURCE_CAJA,
        self::SOURCE_CAJA_CHICA,
        self::SOURCE_PROPIO,
    ];

    protected $fillable = [
        'supply_id',
        'type',
        'quantity',
        'amount',
        'note',
        'money_source',
        'payer_name',
        'register_session_id',
        'cash_movement_id',
        'user_id',
    ];

    protected $casts = [
        'quantity'   => 'float',
        'amount'     => 'float',
        'created_at' => 'datetime',
    ];

    protected static function booted(): void
    {
        static::creating(static fn ($m) => $m->created_at ??= now());
    }

    public function supply(): BelongsTo
    {
        return $this->belongsTo(Supply::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function cashMovement(): BelongsTo
    {
        return $this->belongsTo(CashMovement::class);
    }

    public function session(): BelongsTo
    {
        return $this->belongsTo(CashRegisterSession::class, 'register_session_id');
    }
}
