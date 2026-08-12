<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * TadaimaUS — pedido del checkout dummy (folio TUS-000001).
 * Sin cobro online: el equipo contacta al cliente a mano.
 * Desde 2026-08: ligado a la cuenta del cliente (us_customer_id, nullable —
 * pedidos legacy sin cuenta) + snapshot de dirección de entrega shipping_*
 * (congelado al crear, igual que los items).
 */
class UsOrder extends Model
{
    public const STATUS_NEW = 'new';

    protected $fillable = [
        'us_customer_id', 'order_number', 'customer_name', 'customer_email',
        'customer_phone', 'shipping_address', 'shipping_city', 'shipping_state',
        'shipping_zip', 'shipping_country', 'total_usd', 'status',
    ];

    protected $casts = [
        'total_usd' => 'float',
    ];

    // ── Relations ─────────────────────────────────────────────────────────────

    public function items(): HasMany
    {
        return $this->hasMany(UsOrderItem::class);
    }

    public function customer(): BelongsTo
    {
        return $this->belongsTo(UsCustomer::class, 'us_customer_id');
    }
}
