<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Storage;

class ProductImage extends Model
{
    protected $fillable = ['product_id', 'image_path', 'sort_order'];

    protected $casts = ['sort_order' => 'integer'];

    protected $appends = ['url'];

    public function getUrlAttribute(): string
    {
        return Storage::url($this->image_path);
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }
}
