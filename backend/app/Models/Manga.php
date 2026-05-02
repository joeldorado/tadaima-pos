<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class Manga extends Model
{
    protected $fillable = [
        'name', 'volume_number', 'editorial', 'code',
        'genre', 'public_price', 'profit_margin_percent', 'cost', 'active',
        'price_1', 'price_2', 'price_3', 'price_4', 'price_5', 'stock', 'image_path',
    ];

    protected $casts = [
        'volume_number'         => 'integer',
        'public_price'          => 'float',
        'profit_margin_percent' => 'float',
        'cost'                  => 'float',
        'active'                => 'boolean',
        'price_1'               => 'float',
        'price_2'               => 'float',
        'price_3'               => 'float',
        'price_4'               => 'float',
        'price_5'               => 'float',
        'stock'                 => 'integer',
    ];

    // ─── Relations ────────────────────────────────────────────────────────────

    public function inventory(): HasMany
    {
        return $this->hasMany(MangaInventory::class);
    }

    // ─── Hooks ────────────────────────────────────────────────────────────────

    protected static function booted(): void
    {
        static::saving(function (self $manga) {
            if (isset($manga->public_price, $manga->profit_margin_percent)) {
                $manga->cost = round(
                    $manga->public_price * (1 - $manga->profit_margin_percent / 100),
                    2
                );
            }
            // Default price_1 to public_price if not explicitly set
            if (is_null($manga->price_1) && isset($manga->public_price)) {
                $manga->price_1 = $manga->public_price;
            }
        });
    }
}
