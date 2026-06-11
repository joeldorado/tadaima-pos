<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsToMany;

class PaymentMethod extends Model
{
    protected $fillable = ['name', 'active'];

    protected $casts = ['active' => 'boolean'];

    public function stores(): BelongsToMany
    {
        return $this->belongsToMany(Store::class, 'store_payment_methods')
                    ->withPivot('active')
                    ->withTimestamps();
    }

    /**
     * Clasificación tarjeta vs efectivo-like por nombre ("Tarjeta Débito",
     * "Tarjeta Crédito" del seeder). Usada por el guard de restricciones de
     * pago del checkout y por el bloqueo de cancelaciones con tarjeta.
     */
    public function isCard(): bool
    {
        return mb_stripos((string) $this->name, 'tarjeta') !== false;
    }
}
