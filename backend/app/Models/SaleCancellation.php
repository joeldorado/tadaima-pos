<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * ADR-016 — Log de cancelación de ventas y preventas.
 *
 * Cada fila documenta un evento de cancelación (full / partial_items /
 * liquidation_rollback) con snapshot inmutable de lo cancelado y referencia
 * al cash_movement de salida que reflejó el reverso en el corte del día.
 */
class SaleCancellation extends Model
{
    const MODE_FULL                  = 'full';
    const MODE_PARTIAL_ITEMS         = 'partial_items';
    const MODE_LIQUIDATION_ROLLBACK  = 'liquidation_rollback';

    const REASON_CLIENTE_DEVUELVE = 'cliente_devuelve';
    const REASON_ERROR_CAJERO     = 'error_cajero';
    const REASON_DANADO           = 'dañado';
    const REASON_NO_LLEGO         = 'no_llego';
    const REASON_OTRO             = 'otro';

    public $timestamps = false;

    protected $fillable = [
        'sale_id', 'pre_sale_order_id', 'mode',
        'reason_code', 'reason_text',
        'amount_refunded', 'cash_movement_id', 'cash_session_id',
        'items_snapshot', 'cancelled_by', 'cancelled_at',
    ];

    protected $casts = [
        'amount_refunded' => 'decimal:2',
        'items_snapshot'  => 'array',
        'cancelled_at'    => 'datetime',
    ];

    public function sale(): BelongsTo
    {
        return $this->belongsTo(Sale::class);
    }

    public function preSaleOrder(): BelongsTo
    {
        return $this->belongsTo(PreSaleOrder::class);
    }

    public function cashMovement(): BelongsTo
    {
        return $this->belongsTo(CashMovement::class);
    }

    public function cancelledByUser(): BelongsTo
    {
        return $this->belongsTo(User::class, 'cancelled_by');
    }
}
