<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LayawayPayment extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'layaway_id', 'amount', 'payment_method_id', 'notes',
    ];

    protected $casts = [
        'amount'     => 'float',
        'created_at' => 'datetime',
    ];

    public function layaway(): BelongsTo
    {
        return $this->belongsTo(Layaway::class);
    }

    public function paymentMethod(): BelongsTo
    {
        return $this->belongsTo(PaymentMethod::class);
    }
}
