<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ProductStorePrice extends Model
{
    protected $table = 'product_store_prices';

    protected $fillable = ['product_id', 'store_id', 'price_level', 'price'];

    protected $casts = [
        'price_level' => 'integer',
        'price'       => 'float',
    ];

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }
}
