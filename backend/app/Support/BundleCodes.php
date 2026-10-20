<?php

declare(strict_types=1);

namespace App\Support;

use App\Models\Product;

/**
 * Códigos de los paquetes (2026-10-07): clave corta PAQ-0001 para teclear en
 * Caja y EAN-13 interno (prefijo 200 + dígito verificador) para la etiqueta.
 */
final class BundleCodes
{
    public const SKU_PREFIX = 'PAQ-';

    public const BARCODE_PREFIX = '200'; // rango GS1 de uso interno

    /** Siguiente clave corta: PAQ-0001, PAQ-0002… (crece a 5 dígitos después de 9999). */
    public static function nextSku(): string
    {
        $max = 0;
        $skus = Product::query()->where('sku', 'like', self::SKU_PREFIX.'%')->pluck('sku');
        foreach ($skus as $sku) {
            if (preg_match('/^'.preg_quote(self::SKU_PREFIX, '/').'(\d+)$/i', (string) $sku, $m)) {
                $max = max($max, (int) $m[1]);
            }
        }

        return sprintf('%s%04d', self::SKU_PREFIX, $max + 1);
    }

    /** EAN-13 interno: prefijo 200 + 9 dígitos aleatorios + dígito verificador. */
    public static function generateBarcode(): string
    {
        for ($i = 0; $i < 10; $i++) {
            $body = self::BARCODE_PREFIX.str_pad((string) random_int(0, 999_999_999), 9, '0', STR_PAD_LEFT);
            $code = $body.self::ean13CheckDigit($body);
            if (! Product::query()->where('barcode', $code)->exists()) {
                return $code;
            }
        }

        throw new \DomainException('No se pudo generar un código de barras único. Intenta de nuevo.');
    }

    public static function ean13CheckDigit(string $digits12): int
    {
        if (! preg_match('/^\d{12}$/', $digits12)) {
            throw new \InvalidArgumentException('Se necesitan exactamente 12 dígitos.');
        }
        $sum = 0;
        for ($i = 0; $i < 12; $i++) {
            $sum += (int) $digits12[$i] * ($i % 2 === 0 ? 1 : 3);
        }

        return (10 - ($sum % 10)) % 10;
    }
}
