<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class InventoryMovement extends Model
{
    public $timestamps = false;

    protected $table = 'inventory_movements';

    protected $fillable = [
        'product_id',
        'warehouse_id',
        'type',
        'quantity',
        'reference',
        'notes',
        'user_id',
    ];

    protected $casts = [
        'quantity'   => 'float',
        'created_at' => 'datetime',
    ];

    // ─── Auto-set created_at (no updated_at en esta tabla) ───────────────────

    protected static function booted(): void
    {
        static::creating(static fn ($m) => $m->created_at ??= now());
    }

    // ─── Tipos válidos ────────────────────────────────────────────────────────

    const TYPES_INCREASE = ['entrada', 'devolucion', 'preventa_cancelada'];
    const TYPES_DECREASE = ['venta', 'preventa'];
    const TYPES_NEUTRAL  = ['ajuste', 'transferencia']; // el signo de quantity decide

    const ALL_TYPES = [
        'entrada', 'venta', 'ajuste', 'transferencia',
        'devolucion', 'preventa', 'preventa_cancelada',
    ];

    // ─── Relations ────────────────────────────────────────────────────────────

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    /**
     * Retorna el delta real que se aplica al stock.
     * Para tipos neutrales (ajuste, transferencia) la cantidad ya trae signo.
     */
    public function stockDelta(): float
    {
        if (in_array($this->type, self::TYPES_INCREASE)) {
            return abs($this->quantity);
        }

        if (in_array($this->type, self::TYPES_DECREASE)) {
            return -abs($this->quantity);
        }

        // ajuste / transferencia: el quantity ya puede ser negativo
        return $this->quantity;
    }
}
