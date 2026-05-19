<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PreSaleCatalogStoreLimit extends Model
{
    protected $table = 'pre_sale_catalog_store_limits';

    protected $fillable = ['catalog_id', 'store_id', 'limit_qty'];

    protected $casts = [
        'limit_qty' => 'integer',
    ];

    public function catalog(): BelongsTo
    {
        return $this->belongsTo(PreSaleCatalog::class, 'catalog_id');
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }
}
