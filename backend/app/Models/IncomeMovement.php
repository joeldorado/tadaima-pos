<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class IncomeMovement extends Model
{
    /** Solo created_at (como cash_movements): un movimiento no se edita. */
    public $timestamps = false;

    public const TYPE_SERVICE_FEE    = 'service_fee';
    public const TYPE_EQUIPMENT_SALE = 'equipment_sale';
    public const TYPE_VENDOR_REFUND  = 'vendor_refund';
    public const TYPE_OTHER          = 'other';

    public const TYPES = [
        self::TYPE_SERVICE_FEE,
        self::TYPE_EQUIPMENT_SALE,
        self::TYPE_VENDOR_REFUND,
        self::TYPE_OTHER,
    ];

    /** Lo que lee la gente: corte de caja y Actividad. */
    public const TYPE_LABELS = [
        self::TYPE_SERVICE_FEE    => 'Comisión/Servicio',
        self::TYPE_EQUIPMENT_SALE => 'Venta de Equipo',
        self::TYPE_VENDOR_REFUND  => 'Dev. Proveedor',
        self::TYPE_OTHER          => 'Otro',
    ];

    public const PAYMENT_METHOD_CASH     = 'cash';
    public const PAYMENT_METHOD_CARD     = 'card';
    public const PAYMENT_METHOD_TRANSFER = 'transfer';

    public const PAYMENT_METHODS = [
        self::PAYMENT_METHOD_CASH,
        self::PAYMENT_METHOD_CARD,
        self::PAYMENT_METHOD_TRANSFER,
    ];

    protected $fillable = [
        'register_session_id',
        'store_id',
        'type',
        'payment_method',
        'amount',
        'description',
        'cash_movement_id',
        'user_id',
    ];

    protected $casts = [
        'amount'     => 'float',
        'created_at' => 'datetime',
    ];

    protected static function booted(): void
    {
        static::creating(static fn ($m) => $m->created_at ??= now());
    }

    public static function typeLabel(string $type): string
    {
        return self::TYPE_LABELS[$type] ?? $type;
    }

    public function session(): BelongsTo
    {
        return $this->belongsTo(CashRegisterSession::class, 'register_session_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    public function cashMovement(): BelongsTo
    {
        return $this->belongsTo(CashMovement::class);
    }
}
