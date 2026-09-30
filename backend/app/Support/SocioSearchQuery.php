<?php

declare(strict_types=1);

namespace App\Support;

use Illuminate\Support\Str;

/**
 * Reglas de la búsqueda de socios Tadaima por nombre (2026-09-30).
 *
 * La base de socios es de SOLO LECTURA (otro Supabase) y su `ilike` no ignora
 * acentos: "Lizarraga" no encontraba a "Lizárraga". Además se comparaba el
 * texto completo contra nombre/apellidos/email por separado, así que un nombre
 * completo ("Andrea Lizarraga Navarro") no coincidía con ningún campo.
 *
 * Solución del lado del POS: se busca palabra por palabra (todas deben
 * aparecer); primero tal cual la escribieron y, si faltan resultados, con cada
 * vocal/ñ como comodín `_` (encuentra la versión con o sin acento). Al final se
 * filtra en PHP sin acentos para quitar lo que el comodín trae de más.
 */
final class SocioSearchQuery
{
    private const MAX_WORDS = 4;

    /** Desde este largo las vocales son comodín (en palabras cortas traería de más). */
    private const MIN_WILDCARD_LENGTH = 4;

    /** Texto en minúsculas y sin acentos ("Lizárraga Núñez" → "lizarraga nunez"). */
    public static function normalize(string $text): string
    {
        return Str::ascii(mb_strtolower($text));
    }

    /** Como normalize() pero conserva la ñ: "Muñoz" no debe quedar como "munoz" en el patrón. */
    private static function foldKeepingEnye(string $text): string
    {
        $parts = explode('ñ', mb_strtolower($text));

        return implode('ñ', array_map(static fn (string $part): string => Str::ascii($part), $parts));
    }

    /**
     * Palabras de la búsqueda tal cual (minúsculas, con sus acentos), sin signos
     * (se conservan @ . _ - por los correos), sin las de 1 letra y máximo 4.
     *
     * @return list<string>
     */
    public static function words(string $q): array
    {
        $parts = preg_split('/\s+/u', mb_strtolower($q), -1, PREG_SPLIT_NO_EMPTY) ?: [];
        $words = [];
        foreach ($parts as $part) {
            $clean = trim((string) preg_replace('/[^\p{L}\p{N}@._-]/u', '', $part), '.-_');
            if (mb_strlen($clean) >= 2) {
                $words[] = $clean;
            }
        }

        return array_slice($words, 0, self::MAX_WORDS);
    }

    /**
     * Patrón sin acentos para `ilike` (sin los `*`): en palabras largas cada vocal
     * es `_` (en la base pueden estar con o sin acento) y la ñ tecleada también
     * ("Muñoz" encuentra "Munoz"). Al revés no: una n tecleada se queda como n
     * ("Munoz" no trae "Muñoz"); hacerla comodín traería demasiados candidatos.
     */
    public static function likePattern(string $word): string
    {
        $folded = self::foldKeepingEnye($word);
        if (mb_strlen($folded) < self::MIN_WILDCARD_LENGTH) {
            return $folded;
        }

        return (string) preg_replace('/[aeiouñ]/u', '_', $folded);
    }

    /**
     * ¿El texto (nombre + apellidos + correo) contiene TODAS las palabras, sin
     * importar acentos ni mayúsculas?
     *
     * @param list<string> $words
     */
    public static function matches(string $text, array $words): bool
    {
        $haystack = self::normalize($text);
        foreach ($words as $word) {
            if (! str_contains($haystack, self::normalize($word))) {
                return false;
            }
        }

        return true;
    }
}
