<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CatalogSetting extends Model
{
    protected $table = 'catalog_settings';

    protected $fillable = ['store_id', 'catalog_url', 'show_price', 'show_stock'];

    protected $casts = [
        'show_price' => 'boolean',
        'show_stock' => 'boolean',
    ];

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }
}
