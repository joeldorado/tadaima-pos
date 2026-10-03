<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Regla del COSTO de un tomo (Joel, 2026-10-03) — UN solo lugar de verdad para
 * la edición de tomos (MangaController) y tadaima:homologar-costo-tomos:
 *
 * - El costo del manga nacional se homologa al 30% de margen sobre el precio A
 *   (`product_prices.price_1`, el público normal — NO el de socio):
 *   `costo = precio A × 0.70`. Ej.: Tomo 19 MHA, 159 → 111.30.
 * - El margen no se guarda: se deriva de costo y precio A.
 * - Un margen de 0 (o vacío, o ≥ 100) no es un margen capturado. El modal de
 *   edición mandaba 0 cuando el campo iba vacío y el costo quedaba = precio.
 */
final class TomoCost
{
    public const MARGEN_DEFAULT = 30.0;

    /** Margen capturado utilizable: mayor a 0 y menor a 100. Lo demás → null. */
    public static function margenUtilizable(mixed $margen): ?float
    {
        if (! is_numeric($margen)) {
            return null;
        }
        $m = (float) $margen;

        return ($m > 0 && $m < 100) ? $m : null;
    }

    /** `precio × (1 − margen/100)` a 2 decimales. */
    public static function desdePrecio(float $precio, float $margen = self::MARGEN_DEFAULT): float
    {
        return round($precio * (1 - $margen / 100), 2);
    }

    /** Margen que hoy tiene el tomo (sin redondear); null si no tiene costo o precio. */
    public static function margenVigente(?float $costo, ?float $precio): ?float
    {
        if ($costo === null || $precio === null || $costo <= 0 || $precio <= 0) {
            return null;
        }

        return ($precio - $costo) / $precio * 100;
    }
}
