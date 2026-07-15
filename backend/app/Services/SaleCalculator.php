<?php

declare(strict_types=1);

namespace App\Services;

/**
 * Calculadora ÚNICA de totales de venta — gemelo server-side de
 * `landing/src/lib/saleCalc.ts` (Descuentos v2, 2026-07-14).
 *
 * Regla de oro: el total es SIEMPRE una función pura del estado actual de las
 * líneas — se recalcula completo, nunca se acarrea un descuento previo (ese
 * acarreo era el bug del descuento "atorado" del modelo global viejo).
 *
 * No-stacking (regla de negocio cerrada con el cliente): a lo más UN beneficio
 * por unidad. Precedencia por línea: descuento manual > promo NxM > nada.
 * El cupón (Fase 4) aplica a nivel venta pero SOLO sobre líneas sin beneficio.
 *
 * El server NO confía en montos del cliente: recibe kind/basis/value y
 * recomputa el monto aquí. Si cambias el algoritmo, cambia también saleCalc.ts.
 */
final class SaleCalculator
{
    public const DISCOUNT_REASONS = ['danado', 'caducidad', 'exhibicion', 'cortesia', 'otro'];

    /**
     * @param array<int, array{
     *   product_id: int,
     *   unit_price: float,
     *   qty: float,
     *   line_discount?: array{kind: string, basis: string, value: float, reason?: ?string, note?: ?string}|null,
     * }> $lines Líneas en el MISMO orden en que se persistirán (zip posicional).
     * @param iterable<\App\Models\ProductPromotion> $promotions Promos VIGENTES
     *   de los productos del carrito (el caller filtra con currentlyActive()).
     *
     * @return array{
     *   lines: array<int, array{
     *     gross: float,
     *     benefit_type: ?string,
     *     discount_amount: float,
     *     applied_promotion_id: ?int,
     *     promo_name: ?string,
     *     promo_free_qty: ?int,
     *   }>,
     *   subtotal: float,
     *   line_benefit_total: float,
     *   total: float,
     * }
     */
    public function calculate(array $lines, iterable $promotions = []): array
    {
        // Agrupar promos por producto para el lookup por línea.
        $promosByProduct = [];
        foreach ($promotions as $promo) {
            $promosByProduct[(int) $promo->product_id][] = $promo;
        }

        $resultLines = [];
        $subtotal    = 0.0;
        $netSum      = 0.0;

        foreach ($lines as $line) {
            $gross = self::round2((float) $line['unit_price'] * (float) $line['qty']);

            $benefitType    = null;
            $discountAmount = 0.0;
            $appliedPromoId = null;
            $promoName      = null;
            $promoFreeQty   = null;

            $discount = $line['line_discount'] ?? null;
            if (is_array($discount)) {
                // Precedencia: descuento manual > promo (no-stacking). Una línea
                // descontada a mano queda FUERA del motor NxM.
                $discountAmount = $this->lineDiscountAmount(
                    kind:      (string) $discount['kind'],
                    basis:     (string) $discount['basis'],
                    value:     (float) $discount['value'],
                    unitPrice: (float) $line['unit_price'],
                    qty:       (float) $line['qty'],
                );
                if ($discountAmount > 0) {
                    $benefitType = 'discount';
                }
            } else {
                // Mejor promo para el cliente (mayor ahorro; empate → mayor
                // priority, luego menor id) — espejo de bestPromoBenefit en
                // saleCalc.ts. Q se evalúa POR LÍNEA (no pooled entre splits).
                $best = $this->bestPromoBenefit(
                    $promosByProduct[(int) $line['product_id']] ?? [],
                    (float) $line['unit_price'],
                    (float) $line['qty'],
                );
                if ($best !== null) {
                    $benefitType    = 'promo';
                    $discountAmount = $best['amount'];
                    $appliedPromoId = $best['promo_id'];
                    $promoName      = $best['promo_name'];
                    $promoFreeQty   = $best['free_qty'];
                }
            }

            $net = self::round2(max(0.0, $gross - $discountAmount));

            $resultLines[] = [
                'gross'                => $gross,
                'benefit_type'         => $benefitType,
                'discount_amount'      => $discountAmount,
                'applied_promotion_id' => $appliedPromoId,
                'promo_name'           => $promoName,
                'promo_free_qty'       => $promoFreeQty,
            ];

            $subtotal += $gross;
            $netSum   += $net;
        }

        $subtotal = self::round2($subtotal);
        $netSum   = self::round2($netSum);

        return [
            'lines'              => $resultLines,
            'subtotal'           => $subtotal,
            'line_benefit_total' => self::round2($subtotal - $netSum),
            'total'              => $netSum,
        ];
    }

    /**
     * Beneficio de una promo NxM sobre una línea: groups = floor(Q/N),
     * gratis = groups × (N−M), resto a precio completo. Espejo de
     * computePromoBenefit en saleCalc.ts. Null si no alcanza (Q < N) o inválida.
     *
     * @param array<int, \App\Models\ProductPromotion> $promos
     * @return array{amount: float, promo_id: int, promo_name: string, free_qty: int}|null
     */
    private function bestPromoBenefit(array $promos, float $unitPrice, float $qty): ?array
    {
        $best = null;

        foreach ($promos as $promo) {
            $buyN = (int) $promo->buy_n;
            $payM = (int) $promo->pay_m;
            if ($buyN < 1 || $payM < 1 || $payM >= $buyN) {
                continue;
            }
            $groups  = (int) floor($qty / $buyN);
            $freeQty = $groups * ($buyN - $payM);
            if ($freeQty <= 0) {
                continue;
            }
            $amount = self::round2($freeQty * $unitPrice);
            if ($amount <= 0) {
                continue;
            }

            $candidate = [
                'amount'     => $amount,
                'promo_id'   => (int) $promo->id,
                'promo_name' => (string) $promo->name,
                'free_qty'   => $freeQty,
                'priority'   => (int) $promo->priority,
            ];

            if (
                $best === null
                || $candidate['amount'] > $best['amount']
                || ($candidate['amount'] === $best['amount']
                    && ($candidate['priority'] > $best['priority']
                        || ($candidate['priority'] === $best['priority'] && $candidate['promo_id'] < $best['promo_id'])))
            ) {
                $best = $candidate;
            }
        }

        if ($best === null) {
            return null;
        }
        unset($best['priority']);

        return $best;
    }

    /**
     * Monto del descuento manual de una línea, clampeado a [0, base].
     * fixed+unit → value × qty · fixed+line → value · percent → base × value/100
     * (percent siempre sobre la base de la línea, igual que saleCalc.ts).
     */
    private function lineDiscountAmount(string $kind, string $basis, float $value, float $unitPrice, float $qty): float
    {
        $base = $unitPrice * $qty;
        if (! is_finite($value) || $value <= 0 || $base <= 0) {
            return 0.0;
        }

        $raw = $kind === 'percent'
            ? $base * ($value / 100)
            : ($basis === 'unit' ? $value * $qty : $value);

        return min(self::round2($raw), self::round2($base));
    }

    private static function round2(float $n): float
    {
        return round($n, 2);
    }
}
