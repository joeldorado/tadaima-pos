<?php

declare(strict_types=1);

namespace App\Support;

use App\Models\PreSaleOrderItem;

/**
 * Descuento manual de una partida de preventa al liquidar (2026-11-16, T-003).
 *
 * Es el mismo descuento de Caja para una venta normal ($ o %, por pieza o por
 * línea, con motivo y nota), pero con un tope: nunca más de lo que le FALTA
 * pagar a la pieza. Así el anticipo nunca queda de más y no sale dinero de la
 * caja (decisión de Joel).
 *
 * Lo que le falta a cada pieza sale del mismo reparto que usa Caja
 * (`presaleDeliveryCharge` en landing/src/lib/presaleAllocation.ts): lo pagado
 * menos lo ya entregado es el anticipo de las pendientes, parejo por pieza y
 * con tope en el precio de cada una, en centavos enteros. Si cambias uno,
 * cambia el otro.
 */
final class PresaleItemDiscount
{
    public const REASONS = ['danado', 'caducidad', 'exhibicion', 'cortesia', 'otro'];

    private const EPSILON = 0.000001;

    /**
     * Monto del descuento sobre el precio pactado de la partida, igual que en
     * una venta: fixed+unit → valor × piezas · fixed+line → valor · percent →
     * bruto × %/100. Nunca más que el bruto.
     */
    public static function amount(string $kind, string $basis, float $value, float $unitPrice, int $qty): float
    {
        $gross = $unitPrice * $qty;
        if (! is_finite($value) || $value <= 0 || $gross <= 0) {
            return 0.0;
        }

        $raw = $kind === 'percent'
            ? $gross * ($value / 100)
            : ($basis === 'unit' ? $value * $qty : $value);

        return min(round($raw, 2), round($gross, 2));
    }

    /** Neto de una partida: precio pactado × piezas − su descuento. */
    public static function lineTotal(PreSaleOrderItem $item): float
    {
        return round(max(0.0, $item->quantity * $item->unit_price - (float) ($item->discount_amount ?? 0)), 2);
    }

    /**
     * Lo que le falta pagar a cada partida pendiente (0 en las entregadas),
     * indexado por id de partida. Espejo de `presaleDeliveryCharge`.
     *
     * @param  iterable<PreSaleOrderItem>  $items  todas las partidas del folio
     * @return array<int, float>
     */
    public static function pendingByItem(iterable $items, float $paid): array
    {
        $lines = [];
        foreach ($items as $item) {
            $lines[] = $item;
        }

        $delivered = array_map(fn (PreSaleOrderItem $it) => $it->status === PreSaleOrderItem::STATUS_DELIVERED, $lines);
        $totals    = array_map(fn (PreSaleOrderItem $it) => (int) round(self::lineTotal($it) * 100), $lines);

        $deliveredTotal = 0;
        foreach ($totals as $i => $total) {
            $deliveredTotal += $delivered[$i] ? $total : 0;
        }
        $pool = max(0, (int) round(max(0.0, $paid) * 100) - $deliveredTotal);

        $pieces   = array_map(fn (PreSaleOrderItem $it, bool $done) => $done ? 0 : max(0, (int) $it->quantity), $lines, $delivered);
        $capacity = array_map(fn (int $total, bool $done) => $done ? 0 : $total, $totals, $delivered);
        $shares   = self::wholeCents(self::splitByPiece((float) $pool, $pieces, $capacity), (float) $pool, $capacity);

        $pending = [];
        foreach ($lines as $i => $item) {
            $pending[$item->id] = $delivered[$i] ? 0.0 : max(0, $totals[$i] - $shares[$i]) / 100;
        }

        return $pending;
    }

    /**
     * @param  array<int, float>  $shares
     * @param  array<int, int>    $capacity
     * @return array<int, int>
     */
    private static function wholeCents(array $shares, float $total, array $capacity): array
    {
        $floors   = array_map(fn (float $s) => (int) floor($s + self::EPSILON), $shares);
        $leftover = (int) round(min($total, array_sum($shares))) - array_sum($floors);

        $order = array_keys($shares);
        usort($order, function (int $a, int $b) use ($shares, $floors) {
            $fa = $shares[$a] - $floors[$a];
            $fb = $shares[$b] - $floors[$b];

            return $fb <=> $fa ?: $a <=> $b;
        });

        foreach ($order as $i) {
            if ($leftover <= 0) {
                break;
            }
            if ($capacity[$i] > 0 && $floors[$i] >= $capacity[$i]) {
                continue;
            }
            $floors[$i]++;
            $leftover--;
        }

        return $floors;
    }

    /**
     * Reparte `$amount` parejo por pieza sin pasar la capacidad de cada línea;
     * lo que sobra va a las que aún tienen capacidad.
     *
     * @param  array<int, int>  $pieces
     * @param  array<int, int>  $capacity
     * @return array<int, float>
     */
    private static function splitByPiece(float $amount, array $pieces, array $capacity): array
    {
        $share = array_fill(0, count($pieces), 0.0);
        if ($share === [] || $amount <= 0) {
            return $share;
        }

        $remaining = $amount;
        $open = array_values(array_filter(array_keys($pieces), fn (int $i) => $capacity[$i] > self::EPSILON));

        while ($remaining > self::EPSILON && $open !== []) {
            $openPieces = array_sum(array_map(fn (int $i) => $pieces[$i], $open));
            $perPiece   = $openPieces > 0 ? $remaining / $openPieces : $remaining / count($open);
            $assigned   = 0.0;
            $stillOpen  = [];
            foreach ($open as $i) {
                $wanted = $openPieces > 0 ? $perPiece * $pieces[$i] : $perPiece;
                $room   = $capacity[$i] - $share[$i];
                $take   = min($wanted, $room);
                $share[$i] += $take;
                $assigned  += $take;
                if ($room - $take > self::EPSILON) {
                    $stillOpen[] = $i;
                }
            }
            $remaining -= $assigned;
            $open = $stillOpen;
        }

        // Sobrepago: el resto va parejo por pieza para no perderlo (mismo que Caja).
        if ($remaining > self::EPSILON) {
            $totalPieces = array_sum($pieces);
            foreach ($share as $i => $s) {
                $share[$i] = $s + ($totalPieces > 0 ? $remaining * $pieces[$i] / $totalPieces : $remaining / count($share));
            }
        }

        return $share;
    }
}
