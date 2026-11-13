<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * Una entrega de partidas de un folio de preventa: qué se llevó el cliente en
 * esa visita y con qué pago se liquidó (`payment_id` null = sin cobro).
 * Revertir una entrega la marca con `reverted_at`; no se borra.
 */
class PreSaleDelivery extends Model
{
    protected $fillable = [
        'pre_sale_order_id', 'user_id', 'payment_id', 'amount', 'reverted_at', 'reverted_by',
    ];

    protected $casts = [
        'amount'      => 'float',
        'reverted_at' => 'datetime',
    ];

    public function order(): BelongsTo
    {
        return $this->belongsTo(PreSaleOrder::class, 'pre_sale_order_id');
    }

    public function payment(): BelongsTo
    {
        return $this->belongsTo(PreSaleOrderPayment::class, 'payment_id');
    }

    public function items(): HasMany
    {
        return $this->hasMany(PreSaleOrderItem::class, 'delivery_id');
    }
}
