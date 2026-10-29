<?php

declare(strict_types=1);

namespace App\Support;

use App\Models\Product;

/**
 * Snapshot "extra" de un producto para el diff de `product.updated` /
 * `manga.updated` (2026-10-29): precios por nivel (`product_prices`), métodos
 * de pago permitidos (`product_payment_methods`) y categorías (pivote).
 *
 * Antes el log solo comparaba columnas de `products`, así que cambiar un
 * precio dejaba `changes: []` (3,696 de 5,476 logs en prod). Se consulta la
 * BD directo (no las relaciones cargadas) para que el "después" sea real.
 *
 * Claves del diff: `prices.price_1` … `prices.price_5`, `payment.allow_cash`,
 * `payment.allow_card` y `categories` ({old:[ids], new:[ids]} ordenados).
 */
final class ProductAuditSnapshot
{
    public const PRICE_LEVELS = ['price_1', 'price_2', 'price_3', 'price_4', 'price_5'];

    public const PAYMENT_FLAGS = ['allow_cash', 'allow_card'];

    /** Tolerancia para comparar precios. */
    public const PRICE_EPSILON = 0.001;

    /**
     * @return array{prices: array<string, float|null>, payment: array<string, bool|null>, categories: int[]}
     */
    public static function take(Product $product): array
    {
        $price = $product->price()->first();
        $prices = [];
        foreach (self::PRICE_LEVELS as $level) {
            $raw = $price?->{$level};
            $prices[$level] = $raw === null ? null : (float) $raw;
        }

        $payment = $product->paymentMethod()->first();
        $flags = [];
        foreach (self::PAYMENT_FLAGS as $flag) {
            $raw = $payment?->{$flag};
            $flags[$flag] = $raw === null ? null : (bool) $raw;
        }

        $categoryIds = $product->categories()->pluck('product_categories.id')
            ->map(fn ($id) => (int) $id)->all();
        sort($categoryIds);

        return ['prices' => $prices, 'payment' => $flags, 'categories' => $categoryIds];
    }

    /**
     * Diff entre dos snapshots de `take()`: solo lo que cambió, con {old, new}.
     *
     * @return array<string, array{old: mixed, new: mixed}>
     */
    public static function diff(array $before, array $after): array
    {
        $changes = [];

        foreach (self::PRICE_LEVELS as $level) {
            $old = $before['prices'][$level] ?? null;
            $new = $after['prices'][$level] ?? null;
            if (! self::sameNumber($old, $new)) {
                $changes["prices.{$level}"] = ['old' => $old, 'new' => $new];
            }
        }

        foreach (self::PAYMENT_FLAGS as $flag) {
            $old = $before['payment'][$flag] ?? null;
            $new = $after['payment'][$flag] ?? null;
            if ($old !== $new) {
                $changes["payment.{$flag}"] = ['old' => $old, 'new' => $new];
            }
        }

        $oldCats = $before['categories'] ?? [];
        $newCats = $after['categories'] ?? [];
        if ($oldCats !== $newCats) {
            $changes['categories'] = ['old' => $oldCats, 'new' => $newCats];
        }

        return $changes;
    }

    private static function sameNumber(?float $a, ?float $b): bool
    {
        if ($a === null || $b === null) {
            return $a === $b;
        }

        return abs($a - $b) < self::PRICE_EPSILON;
    }
}
