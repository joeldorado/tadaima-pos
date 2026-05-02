<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class MangaInventory extends Model
{
    protected $table = 'manga_inventory';

    protected $fillable = ['manga_id', 'warehouse_id', 'quantity'];

    protected $casts = ['quantity' => 'integer'];

    // ─── Relations ────────────────────────────────────────────────────────────

    public function manga(): BelongsTo
    {
        return $this->belongsTo(Manga::class);
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }
}
