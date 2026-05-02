<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PreSalePayment extends Model
{
    public $timestamps = false;

    protected $table = 'pre_sale_payments';

    protected $fillable = [
        'pre_sale_id', 'amount', 'payment_method_id', 'notes',
    ];

    protected $casts = [
        'amount'     => 'float',
        'created_at' => 'datetime',
    ];

    protected static function booted(): void
    {
        static::creating(static fn ($m) => $m->created_at ??= now());
    }

    public function preSale(): BelongsTo
    {
        return $this->belongsTo(PreSale::class);
    }

    public function paymentMethod(): BelongsTo
    {
        return $this->belongsTo(PaymentMethod::class);
    }
}
