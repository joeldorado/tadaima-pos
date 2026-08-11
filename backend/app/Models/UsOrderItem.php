<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * TadaimaUS — línea de pedido US. name, price_usd y line_total_usd son
 * snapshot congelado al crear el pedido (editar/borrar el listing no altera
 * pedidos históricos — mismo espíritu que ADR-015 cost_at_sale).
 */
class UsOrderItem extends Model
{
    protected $fillable = [
        'us_order_id', 'us_listing_id', 'name',
        'price_usd', 'quantity', 'line_total_usd',
    ];

    protected $casts = [
        'price_usd'      => 'float',
        'quantity'       => 'integer',
        'line_total_usd' => 'float',
    ];

    // ── Relations ─────────────────────────────────────────────────────────────

    public function order(): BelongsTo
    {
        return $this->belongsTo(UsOrder::class, 'us_order_id');
    }

    public function listing(): BelongsTo
    {
        return $this->belongsTo(UsListing::class, 'us_listing_id');
    }
}
