<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Payment extends Model
{
    public $timestamps = false;

    protected $table = 'payments';

    protected $fillable = [
        'sale_id',
        'pre_sale_id',
        'payment_method_id',
        'terminal_id',
        'amount',
        'commission_amount',
    ];

    protected $casts = [
        'amount'            => 'float',
        'commission_amount' => 'float',
        'created_at'        => 'datetime',
    ];

    protected static function booted(): void
    {
        static::creating(static fn ($p) => $p->created_at ??= now());
    }

    public function sale(): BelongsTo
    {
        return $this->belongsTo(Sale::class);
    }

    public function paymentMethod(): BelongsTo
    {
        return $this->belongsTo(PaymentMethod::class);
    }
}
