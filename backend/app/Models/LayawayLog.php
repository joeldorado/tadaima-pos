<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class LayawayLog extends Model
{
    public $timestamps = false;

    protected $fillable = [
        'layaway_id', 'action', 'user_id', 'notes',
    ];

    protected $casts = [
        'created_at' => 'datetime',
    ];

    public function layaway(): BelongsTo
    {
        return $this->belongsTo(Layaway::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
