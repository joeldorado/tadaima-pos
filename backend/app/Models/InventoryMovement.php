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

    // `apartado` / `apartado_cancelado` (2026-11-19): LayawayService los guarda
    // con cantidad POSITIVA; sin estar aquí, stockDelta() los mostraba como +N
    // aunque el apartado SACA stock (y la cancelación lo regresa).
    const TYPES_INCREASE = ['entrada', 'devolucion', 'preventa_cancelada', 'apartado_cancelado'];
    const TYPES_DECREASE = ['venta', 'preventa', 'apartado'];
    const TYPES_NEUTRAL  = ['ajuste', 'transferencia']; // el signo de quantity decide

    /** Todos los tipos que existen en la tabla (los escribe el sistema). */
    const ALL_TYPES = [
        'entrada', 'venta', 'ajuste', 'transferencia',
        'devolucion', 'preventa', 'preventa_cancelada',
        'apartado', 'apartado_cancelado',
    ];

    /**
     * Tipos que acepta `POST /inventory/movements` (captura manual). Los de
     * apartado NO: solo los escribe LayawayService junto con su apartado.
     */
    const MANUAL_TYPES = [
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
