<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class SystemLog extends Model
{
    protected $table = 'system_logs';

    public $timestamps = false;

    protected $fillable = ['user_id', 'action', 'description'];

    protected $casts = ['created_at' => 'datetime'];

    protected static function booted(): void
    {
        static::creating(static fn ($m) => $m->created_at ??= now());
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Convenience method for writing logs from services or controllers.
     */
    public static function write(string $action, string $description = null, int $userId = null): self
    {
        return static::create([
            'user_id'     => $userId,
            'action'      => $action,
            'description' => $description,
        ]);
    }
}
