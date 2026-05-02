<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProductPaymentMethod extends Model
{
    protected $table = 'product_payment_methods';

    protected $fillable = ['product_id', 'allow_cash', 'allow_card'];

    protected $casts = [
        'allow_cash' => 'boolean',
        'allow_card' => 'boolean',
    ];

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }
}
