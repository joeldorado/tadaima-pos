<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class PreSaleLog extends Model
{
    public $timestamps = false;

    protected $table = 'pre_sale_logs';

    protected $fillable = [
        'pre_sale_id', 'action', 'user_id', 'notes',
    ];

    protected $casts = [
        'created_at' => 'datetime',
    ];

    protected static function booted(): void
    {
        static::creating(static fn ($m) => $m->created_at ??= now());
    }

    public function preSale(): BelongsTo
    {
        return $this->belongsTo(PreSale::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
