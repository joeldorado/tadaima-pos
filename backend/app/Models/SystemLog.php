<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Support\Facades\Auth;

class SystemLog extends Model
{
    protected $table = 'system_logs';

    public $timestamps = false;

    protected $fillable = ['user_id', 'action', 'entity_type', 'entity_id', 'description', 'meta'];

    protected $casts = [
        'created_at' => 'datetime',
        'meta'       => 'array',
    ];

    protected static function booted(): void
    {
        static::creating(static fn ($m) => $m->created_at ??= now());
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * Escribe una entrada genérica de auditoría.
     *
     * @param  string|null  $action       'product.created', 'inventory.adjusted', etc.
     * @param  string|null  $description  Resumen legible para humanos.
     * @param  int|null     $userId       Si null, intenta Auth::id() (request HTTP autenticado).
     * @param  string|null  $entityType   'product' | 'manga' | 'inventory' | …
     * @param  int|null     $entityId     ID del registro afectado.
     * @param  array|null   $meta         Diff/payload arbitrario (campos cambiados, etc.).
     */
    public static function write(
        string $action,
        ?string $description = null,
        ?int $userId = null,
        ?string $entityType = null,
        ?int $entityId = null,
        ?array $meta = null,
    ): self {
        return static::create([
            'user_id'     => $userId ?? Auth::id(),
            'action'      => $action,
            'entity_type' => $entityType,
            'entity_id'   => $entityId,
            'description' => $description,
            'meta'        => $meta,
        ]);
    }
}
