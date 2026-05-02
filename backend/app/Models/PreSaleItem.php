<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PreSaleItem extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'pre_sale_id', 'product_id', 'manga_id',
        'quantity', 'price_level', 'price', 'status',
    ];

    protected $casts = [
        'quantity'    => 'float',
        'price_level' => 'integer',
        'price'       => 'float',
        'created_at'  => 'datetime',
    ];

    protected static function booted(): void
    {
        static::creating(static fn ($m) => $m->created_at ??= now());
    }

    public function preSale(): BelongsTo
    {
        return $this->belongsTo(PreSale::class);
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }
}
