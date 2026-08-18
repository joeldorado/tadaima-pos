<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class ProductCategory extends Model
{
    protected $fillable = ['name', 'description', 'active'];

    protected $casts = ['active' => 'boolean'];

    /**
     * Productos vinculados (N:N vía product_category_assignments, 2026-08-17).
     * `withCount('products')` cuenta vínculos del pivote — es lo que ve el
     * admin como "N productos" y lo que se desvincula al borrar la categoría.
     */
    public function products(): BelongsToMany
    {
        return $this->belongsToMany(Product::class, 'product_category_assignments', 'category_id', 'product_id')
            ->withPivot('position')
            ->withTimestamps();
    }
}
