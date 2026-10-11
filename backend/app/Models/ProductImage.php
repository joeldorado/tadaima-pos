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
        return self::resolveUrl($this->image_path);
    }

    /**
     * Resuelve un `image_path` crudo a URL pública. Extraído de
     * `getUrlAttribute()` (2026-10-10) para que snapshots de imagen fuera de
     * este modelo (p.ej. `sale_items.product_image`) resuelvan la URL con la
     * MISMA lógica de storage, sin duplicarla.
     */
    public static function resolveUrl(?string $imagePath): string
    {
        if (!$imagePath || $imagePath === '0') {
            return '';
        }
        if (config('filesystems.default') === 'gcs') {
            $bucket = config('filesystems.disks.gcs.bucket', 'tadaima-media');
            return "https://storage.googleapis.com/{$bucket}/{$imagePath}";
        }
        return Storage::url($imagePath);
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }
}
