<?php

declare(strict_types=1);

namespace App\Support;

use Carbon\Carbon;
use Illuminate\Contracts\Database\Query\Builder as QueryBuilder;
use Illuminate\Database\Eloquent\Builder as EloquentBuilder;
use Illuminate\Support\Facades\DB;

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
    /** Tope de fechas sueltas por consulta (el selector de Reportes ofrece un año). */
    public const MAX_DATES = 366;

    /**
     * Zona horaria del negocio. Configurable vía env BUSINESS_TIMEZONE
     * (config/app.php → business_timezone). Default America/Tijuana — decisión
     * Joel 2026-06-11 (cierra TODO #117): las tiendas operan en Tijuana; con
     * CDMX el día de negocio brincaba a las 11pm locales y el "Hoy" del POS
     * quedaba vacío. DEBE coincidir con BUSINESS_TZ del frontend
     * (landing/src/lib/date.ts).
     */
    public static function timezone(): string
    {
        return (string) config('app.business_timezone', 'America/Tijuana');
    }

    /**
     * Expresión SQL que convierte una columna timestamp (UTC) al DÍA de
     * negocio (fecha local), para agrupar por día en el motor. Driver-aware;
     * la zona viene de config, nunca del usuario. Úsala con selectRaw/groupByRaw.
     *
     * SQLite (solo tests) no conoce zonas: aplica el offset actual de la zona
     * (un cambio de horario a mitad de rango desplaza una hora; aceptable).
     */
    public static function businessDayExpr(string $column): string
    {
        $tz = self::timezone();

        return match (DB::getDriverName()) {
            'pgsql'  => "(({$column} AT TIME ZONE 'UTC') AT TIME ZONE '{$tz}')::date",
            'mysql', 'mariadb' => "DATE(CONVERT_TZ({$column}, '+00:00', '{$tz}'))",
            default  => "date({$column}, '".Carbon::now($tz)->utcOffset()." minutes')",
        };
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

    /**
     * Normaliza el param `dates`/`payment_dates` del request: acepta tanto un
     * array (`dates[]=a&dates[]=b`) como un string separado por comas
     * (`dates=a,b`, lo que manda el frontend para no depender de cómo axios
     * serialice arrays en query strings).
     *
     * @return string[]
     */
    public static function parseDatesParam(mixed $value): array
    {
        if (is_string($value)) {
            $value = explode(',', $value);
        }

        return array_values(array_filter((array) $value, fn ($d) => is_string($d) && $d !== ''));
    }

    /**
     * Filtra `$query` por `$column` usando fechas sueltas (no consecutivas) si
     * `$dates` trae algo, o el rango `$from`/`to` de siempre si no.
     *
     * Reparte `$dates` en ventanas UTC por día (mismo `fromUtc`/`toUtc` de un
     * solo día) unidas por OR, en vez de un `whereBetween`/`DATE()` crudo —
     * misma lógica TZ-safe que ya usa el rango continuo, día por día.
     *
     * @param EloquentBuilder|QueryBuilder $query
     * @param string[] $dates
     */
    public static function applyDates(
        EloquentBuilder|QueryBuilder $query,
        string $column,
        array $dates,
        ?string $from = null,
        ?string $to = null,
    ): EloquentBuilder|QueryBuilder {
        if (count($dates) > 0) {
            // Solo las que se pueden leer, sin repetir y con tope (el selector
            // ofrece un año). Si ninguna sirve, NO se quita el filtro: un OR
            // vacío dejaba pasar todas las ventas (2026-10-19).
            $windows = [];
            foreach (array_slice(array_unique($dates), 0, self::MAX_DATES) as $date) {
                $start = self::fromUtc($date);
                $end = self::toUtc($date);
                if ($start && $end) {
                    $windows[] = [$start, $end];
                }
            }
            if ($windows === []) {
                return $query->whereRaw('1 = 0');
            }

            return $query->where(function ($q) use ($column, $windows) {
                foreach ($windows as [$start, $end]) {
                    $q->orWhere(function ($q2) use ($column, $start, $end) {
                        $q2->where($column, '>=', $start)->where($column, '<=', $end);
                    });
                }
            });
        }

        $fromUtc = self::fromUtc($from);
        $toUtc = self::toUtc($to);
        if ($fromUtc) {
            $query->where($column, '>=', $fromUtc);
        }
        if ($toUtc) {
            $query->where($column, '<=', $toUtc);
        }

        return $query;
    }
}
