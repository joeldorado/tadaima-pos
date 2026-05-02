<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProductPrice extends Model
{
    protected $fillable = [
        'product_id',
        'price_1', 'price_2', 'price_3', 'price_4', 'price_5',
    ];

    protected $casts = [
        'price_1' => 'float',
        'price_2' => 'float',
        'price_3' => 'float',
        'price_4' => 'float',
        'price_5' => 'float',
    ];

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }
}
