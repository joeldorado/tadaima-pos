<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Extensión Class-Table-Inheritance del producto cuando product_type='manga'.
 * Solo existe la fila para mangas. Joinea contra products.id.
 */
class ProductMangaDetail extends Model
{
    protected $table = 'product_manga_details';
    protected $primaryKey = 'product_id';
    public $incrementing = false;
    protected $keyType = 'int';

    protected $fillable = [
        'product_id',
        'volume_number',
        'editorial',
        'genre',
    ];

    protected $casts = [
        'volume_number' => 'integer',
    ];

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }
}
