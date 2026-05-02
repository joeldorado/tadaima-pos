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
        if (!$this->image_path || $this->image_path === '0') {
            return '';
        }
        if (config('filesystems.default') === 'gcs') {
            $bucket = config('filesystems.disks.gcs.bucket', 'tadaima-media');
            return "https://storage.googleapis.com/{$bucket}/{$this->image_path}";
        }
        return Storage::url($this->image_path);
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }
}
