<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SalesDraftItem extends Model
{
    public $timestamps = false;

    protected $table = 'sales_draft_items';

    protected $fillable = [
        'draft_id',
        'product_id',
        'manga_id',
        'quantity',
        'price',
        'total',
    ];

    protected $casts = [
        'quantity'   => 'float',
        'price'      => 'float',
        'total'      => 'float',
        'created_at' => 'datetime',
    ];

    // ─── Auto-compute total + created_at ──────────────────────────────────────

    protected static function booted(): void
    {
        $recalculate = static function (self $item): void {
            $item->total = round($item->quantity * $item->price, 2);
        };

        static::creating(static function (self $item) use ($recalculate): void {
            $item->created_at ??= now();
            $recalculate($item);
        });

        static::updating($recalculate);

        // Reservas cross-caja: cada cambio en items extiende la vida del draft padre.
        // Sin esto, un cajero que está editando cantidades vería el modal "por vencer"
        // a los 5 min aunque esté activamente trabajando.
        $bumpDraft = static function (self $item): void {
            \App\Observers\SalesDraftActivityObserver::bumpDraftFromItem($item);
        };

        static::created($bumpDraft);
        static::updated($bumpDraft);
        static::deleted($bumpDraft);
    }

    // ─── Relations ────────────────────────────────────────────────────────────

    public function draft(): BelongsTo
    {
        return $this->belongsTo(SalesDraft::class, 'draft_id');
    }

    public function product(): BelongsTo
    {
        return $this->belongsTo(Product::class);
    }
}
