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

    /**
     * Dinero FÍSICO que entra al cajón: efectivo y dólares (legacy, retirado
     * del dropdown 2026-05-28 pero con ventas vivas). Es una lista de
     * INCLUSIÓN a propósito — un método futuro ("Depósito", "Mercado Pago")
     * queda fuera del esperado del corte por default, que es el lado seguro.
     */
    public function isCashLike(): bool
    {
        $name = mb_strtolower((string) $this->name);

        return str_contains($name, 'efectivo')
            || str_contains($name, 'dolar')
            || str_contains($name, 'dólar');
    }

    /**
     * La misma clasificación de isCashLike() como condición SQL, para los
     * agregados del corte (GET /reports/cash). El doble patrón dolar/dólar
     * cubre MySQL (collation ci pliega acentos) y SQLite (LOWER solo ASCII).
     */
    public static function cashLikeSqlCondition(string $nameExpr): string
    {
        $lower = "LOWER(COALESCE({$nameExpr}, ''))";

        return "({$lower} LIKE '%efectivo%' OR {$lower} LIKE '%dolar%' OR {$lower} LIKE '%dólar%')";
    }
}
