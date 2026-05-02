<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PreSaleOrderPayment extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'pre_sale_order_id', 'amount', 'payment_method_id', 'cashier_id', 'notes',
    ];

    protected $casts = [
        'amount'     => 'float',
        'created_at' => 'datetime',
    ];

    // ── Relations ─────────────────────────────────────────────────────────────

    public function order(): BelongsTo
    {
        return $this->belongsTo(PreSaleOrder::class, 'pre_sale_order_id');
    }

    public function paymentMethod(): BelongsTo
    {
        return $this->belongsTo(PaymentMethod::class);
    }

    public function cashier(): BelongsTo
    {
        return $this->belongsTo(User::class, 'cashier_id');
    }
}
