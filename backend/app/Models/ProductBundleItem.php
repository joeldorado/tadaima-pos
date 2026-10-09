<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Un componente de un paquete: `quantity` piezas del producto `component`
 * por cada paquete `bundle` (Paquetes, 2026-10-07).
 */
class ProductBundleItem extends Model
{
    protected $table = 'product_bundle_items';

    protected $fillable = [
        'bundle_product_id',
        'component_product_id',
        'quantity',
        'position',
    ];

    protected $casts = [
        'bundle_product_id' => 'integer',
        'component_product_id' => 'integer',
        'quantity' => 'integer',
        'position' => 'integer',
    ];

    public function bundle(): BelongsTo
    {
        return $this->belongsTo(Product::class, 'bundle_product_id');
    }

    public function component(): BelongsTo
    {
        return $this->belongsTo(Product::class, 'component_product_id');
    }
}
