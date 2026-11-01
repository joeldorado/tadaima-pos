<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Detalle de una línea regalada (2026-10-31). La línea en sale_items queda en
 * price/total/cost = 0; aquí vive lo que realmente salió: precio de catálogo y
 * costo real por pieza, nota y quién lo marcó.
 */
class SaleGift extends Model
{
    /** Largo máximo de la nota del regalo. */
    public const NOTE_MAX = 80;

    protected $table = 'sale_gifts';

    protected $fillable = [
        'sale_id',
        'sale_item_id',
        'product_id',
        'store_id',
        'quantity',
        'list_price',
        'unit_cost',
        'note',
        'authorized_by',
    ];

    protected $casts = [
        'quantity'   => 'float',
        'list_price' => 'float',
        'unit_cost'  => 'float',
    ];

    public function sale(): BelongsTo
    {
        return $this->belongsTo(Sale::class);
    }

    public function saleItem(): BelongsTo
    {
        return $this->belongsTo(SaleItem::class);
    }

    public function authorizer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'authorized_by');
    }
}
