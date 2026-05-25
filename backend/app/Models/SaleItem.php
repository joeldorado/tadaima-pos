<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SaleItem extends Model
{
    public $timestamps = false;

    protected $table = 'sale_items';

    protected $fillable = [
        'sale_id',
        'product_id',
        'manga_id',
        'quantity',
        'price',
        'total',
        'cost',
    ];

    protected $casts = [
        'quantity'   => 'float',
        'price'      => 'float',
        'total'      => 'float',
        'cost'       => 'float',
        'created_at' => 'datetime',
    ];

    protected static function booted(): void
    {
        static::creating(static fn ($item) => $item->created_at ??= now());
    }

    public function sale(): BelongsTo
    {
        return $this->belongsTo(Sale::class);
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }
}
