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
        // Descuentos v2 — beneficio por línea (computado por SaleCalculator).
        'benefit_type',
        'discount_kind',
        'discount_basis',
        'discount_value',
        'discount_amount',
        'discount_reason',
        'discount_note',
        'discount_authorized_by',
        'applied_promotion_id',
        'promo_name',
        'promo_free_qty',
    ];

    protected $casts = [
        'quantity'        => 'float',
        'price'           => 'float',
        'total'           => 'float',
        'cost'            => 'float',
        'discount_value'  => 'float',
        'discount_amount' => 'float',
        'promo_free_qty'  => 'integer',
        'created_at'      => 'datetime',
    ];

    public const BENEFIT_DISCOUNT = 'discount';
    public const BENEFIT_PROMO    = 'promo';

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
