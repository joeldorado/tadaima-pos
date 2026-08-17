<?php

declare(strict_types=1);

namespace App\Support;

/**
 * Regla de "tomo" / librería (Ruben + Joel, 2026-08-17) — UN solo lugar de
 * verdad para el import del POS viejo, la purga y el depurado:
 *
 * - Un TOMO (manga nacional, módulo Tomos = product_type='manga') es el
 *   artículo cuyo NOMBRE empieza con "Tomo" y viene en una categoría de manga
 *   del origen (Manga / Manga extranjero / kamite / SHONEN JUMP).
 * - Todo lo demás de esas categorías (art books, box sets, ediciones jap/USA,
 *   kamite, revistas) es producto normal con su categoría — NUNCA manga.
 * - "Librería" para importar sin stock = exactamente lo que es tomo.
 * - Los Comics "Tomo…" (Marvel/Panini) se quedan como Comics (decisión Joel).
 *
 * Nota histórica: la migración de Macro (2026-08-03) mapeó por CATEGORÍA
 * (Manga/extranjero/kamite/Shonen → manga) y metió ~800 no-tomos al módulo
 * Tomos; tadaima:depurar-tomos lo corrigió el 2026-08-17.
 */
final class TomoRule
{
    /** Categorías del origen (lowercase) que pueden contener tomos. */
    public const MANGA_CATEGORIES = ['manga', 'manga extranjero', 'kamite', 'shonen jump'];

    /**
     * Substrings (lowercase) de categorías que la migración/purga trataron
     * como "librería" — es el UNIVERSO que revisa tadaima:depurar-tomos, no
     * una protección.
     */
    public const LIBRERIA_CATEGORY_PATTERNS = [
        'manga', 'comic', 'libro', 'libret', 'librer', 'shonen', 'kamite',
    ];

    /** El nombre empieza con "Tomo" (case-insensitive, sin espacios previos). */
    public static function esNombreTomo(string $name): bool
    {
        return str_starts_with(mb_strtolower(trim($name)), 'tomo');
    }

    public static function esCategoriaManga(string $categoria): bool
    {
        return in_array(mb_strtolower(trim($categoria)), self::MANGA_CATEGORIES, true);
    }

    /** Tomo = categoría de manga del origen + nombre que empieza con "Tomo". */
    public static function esTomo(string $name, string $categoria): bool
    {
        return self::esCategoriaManga($categoria) && self::esNombreTomo($name);
    }

    public static function esCategoriaLibreria(string $categoria): bool
    {
        $cat = mb_strtolower(trim($categoria));
        foreach (self::LIBRERIA_CATEGORY_PATTERNS as $pat) {
            if (str_contains($cat, $pat)) {
                return true;
            }
        }

        return false;
    }
}
