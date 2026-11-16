<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PreSaleOrderItem extends Model
{
    const STATUS_PENDING   = 'pending';
    const STATUS_DELIVERED = 'delivered';

    public $timestamps = false;

    protected $fillable = [
        'pre_sale_order_id', 'pre_sale_catalog_id', 'product_id',
        'quantity', 'price_level', 'unit_price', 'cost', 'status', 'delivered_at', 'delivery_id',
        // Descuento manual al liquidar (2026-11-16): espejo de sale_items.discount_*.
        'discount_kind', 'discount_basis', 'discount_value', 'discount_amount',
        'discount_reason', 'discount_note', 'discount_authorized_by',
    ];

    protected $casts = [
        'quantity'     => 'integer',
        'price_level'  => 'integer',
        'unit_price'   => 'float',
        'cost'         => 'float',
        'discount_value'  => 'float',
        'discount_amount' => 'float',
        'delivered_at' => 'datetime',
        'created_at'   => 'datetime',
    ];

    // ── Relations ─────────────────────────────────────────────────────────────

    public function order(): BelongsTo
    {
        return $this->belongsTo(PreSaleOrder::class, 'pre_sale_order_id');
    }

    public function catalog(): BelongsTo
    {
        return $this->belongsTo(PreSaleCatalog::class, 'pre_sale_catalog_id');
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    /** Entrega en la que se llevó esta partida (null = pendiente o folio anterior al registro). */
    public function delivery(): BelongsTo
    {
        return $this->belongsTo(PreSaleDelivery::class, 'delivery_id');
    }

    // ── Computed ──────────────────────────────────────────────────────────────

    /**
     * Neto de la partida: precio pactado × piezas − su descuento manual
     * (2026-11-16). Es lo que el cliente paga por ella; sin descuento es el
     * bruto de siempre.
     */
    public function getSubtotalAttribute(): float
    {
        return \App\Support\PresaleItemDiscount::lineTotal($this);
    }

    /** Bruto de la partida (precio pactado × piezas), sin descuento. */
    public function getGrossTotalAttribute(): float
    {
        return round($this->quantity * $this->unit_price, 2);
    }
}
