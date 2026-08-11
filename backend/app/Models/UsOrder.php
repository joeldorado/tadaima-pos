<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

/**
 * TadaimaUS — pedido del checkout dummy (folio TUS-000001).
 * Sin cobro online: el equipo contacta al cliente a mano.
 */
class UsOrder extends Model
{
    public const STATUS_NEW = 'new';

    protected $fillable = [
        'order_number', 'customer_name', 'customer_email', 'customer_phone',
        'total_usd', 'status',
    ];

    protected $casts = [
        'total_usd' => 'float',
    ];

    // ── Relations ─────────────────────────────────────────────────────────────

    public function items(): HasMany
    {
        return $this->hasMany(UsOrderItem::class);
    }
}
