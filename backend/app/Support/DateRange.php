<?php

declare(strict_types=1);

namespace App\Support;

use Carbon\Carbon;

/**
 * Convierte fechas YYYY-MM-DD del frontend (hora LOCAL del usuario, MX por
 * default) a timestamps UTC para comparar contra columnas timestamp guardadas
 * en UTC.
 *
 * Sin esto, `whereDate('sold_at', '=', '2026-05-21')` compara contra la fecha
 * UTC del timestamp. Una venta a las 19:00 hora MX (= 01:00 UTC del día sig.)
 * NO matchea con el filtro "Hoy" del cajero. Este helper resuelve ese desfase.
 */
class DateRange
{
    /** Zona horaria del negocio. Configurable vía env BUSINESS_TIMEZONE. */
    public static function timezone(): string
    {
        return (string) config('app.business_timezone', 'America/Mexico_City');
    }

    /** Convierte 'YYYY-MM-DD' (hora local) a Carbon UTC al inicio del día. */
    public static function fromUtc(?string $localDate): ?Carbon
    {
        if (! $localDate) {
            return null;
        }
        try {
            return Carbon::parse($localDate . ' 00:00:00', self::timezone())->utc();
        } catch (\Throwable) {
            return null;
        }
    }

    /** Convierte 'YYYY-MM-DD' (hora local) a Carbon UTC al final del día (23:59:59). */
    public static function toUtc(?string $localDate): ?Carbon
    {
        if (! $localDate) {
            return null;
        }
        try {
            return Carbon::parse($localDate . ' 23:59:59', self::timezone())->utc();
        } catch (\Throwable) {
            return null;
        }
    }
}
