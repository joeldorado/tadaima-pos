<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CatalogSetting extends Model
{
    protected $table = 'catalog_settings';

    protected $fillable = [
        'store_id', 'catalog_url', 'whatsapp_number',
        'show_price', 'show_stock', 'show_search', 'show_categories',
        'show_description', 'cart_enabled', 'hide_out_of_stock',
    ];

    protected $casts = [
        'show_price'        => 'boolean',
        'show_stock'        => 'boolean',
        'show_search'       => 'boolean',
        'show_categories'   => 'boolean',
        'show_description'  => 'boolean',
        'cart_enabled'      => 'boolean',
        'hide_out_of_stock' => 'boolean',
    ];

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }
}
