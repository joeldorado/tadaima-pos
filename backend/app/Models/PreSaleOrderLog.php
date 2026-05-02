<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PreSaleOrderLog extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'pre_sale_order_id', 'user_id', 'from_status', 'to_status', 'notes',
    ];

    protected $casts = [
        'created_at' => 'datetime',
    ];

    // ── Relations ─────────────────────────────────────────────────────────────

    public function order(): BelongsTo
    {
        return $this->belongsTo(PreSaleOrder::class, 'pre_sale_order_id');
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
