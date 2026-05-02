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
        'quantity', 'price_level', 'unit_price', 'status', 'delivered_at',
    ];

    protected $casts = [
        'quantity'     => 'integer',
        'price_level'  => 'integer',
        'unit_price'   => 'float',
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

    // ── Computed ──────────────────────────────────────────────────────────────

    public function getSubtotalAttribute(): float
    {
        return round($this->quantity * $this->unit_price, 2);
    }
}
