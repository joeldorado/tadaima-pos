<?php

declare(strict_types=1);

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * Bitácora de armados/desarmados de paquetes por tienda (Paquetes, 2026-10-07).
 * `components_snapshot` congela el desglose de piezas que se movieron.
 */
class BundleAssembly extends Model
{
    public const TYPE_ARMADO = 'armado';

    public const TYPE_DESARMADO = 'desarmado';

    public $timestamps = false;

    protected $table = 'bundle_assemblies';

    protected $fillable = [
        'bundle_product_id',
        'store_id',
        'warehouse_id',
        'user_id',
        'type',
        'quantity',
        'components_snapshot',
        'notes',
        'created_at',
    ];

    protected $casts = [
        'quantity' => 'integer',
        'components_snapshot' => 'array',
        'created_at' => 'datetime',
    ];

    protected static function booted(): void
    {
        static::creating(static fn (self $m) => $m->created_at ??= now());
    }

    public function bundle(): BelongsTo
    {
        return $this->belongsTo(Product::class, 'bundle_product_id');
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function warehouse(): BelongsTo
    {
        return $this->belongsTo(Warehouse::class);
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
