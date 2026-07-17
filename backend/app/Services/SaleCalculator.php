<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\ProductPromotion;

/**
 * Calculadora ÚNICA de totales de venta — gemelo server-side de
 * `landing/src/lib/saleCalc.ts` (Descuentos v2, 2026-07-14).
 *
 * Regla de oro: el total es SIEMPRE una función pura del estado actual de las
 * líneas — se recalcula completo, nunca se acarrea un descuento previo (ese
 * acarreo era el bug del descuento "atorado" del modelo global viejo).
 *
 * STACKING (regla actualizada por Joel 2026-07-17; antes era no-stacking):
 * la promo NxM aplica PRIMERO y el descuento manual se calcula sobre el
 * resultado de la promo (percent sobre el neto-promo; fixed clampeado al
 * neto-promo). discount_amount de la línea = promo + manual (rollup intacto);
 * benefit_type = 'discount' si hay manual (los campos promo_* igual se
 * persisten cuando la promo aplicó — así el historial muestra ambos).
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
     *     promo_amount: ?float,
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

        // OVERRIDE LOCAL (Joel 2026-07-20): si el producto tiene promo LOCAL
        // vigente (store_id != null — el caller ya filtró forStore, así que
        // cualquier local ES de la tienda de la venta), la GLOBAL queda
        // desactivada para esa tienda. Gana la local aunque ahorre menos: es
        // lo que la tienda configuró. El override es por EXISTENCIA (si la
        // local no alcanza por cantidad, la global NO revive — predecible).
        // Espejo de recalculateSale en saleCalc.ts.
        foreach ($promosByProduct as $productId => $promos) {
            $hasLocal = false;
            foreach ($promos as $promo) {
                if ($promo->store_id !== null) {
                    $hasLocal = true;
                    break;
                }
            }
            if ($hasLocal) {
                $promosByProduct[$productId] = array_values(
                    array_filter($promos, fn ($p) => $p->store_id !== null)
                );
            }
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

            // STACKING (Joel 2026-07-17): la promo aplica SIEMPRE que alcance;
            // el descuento manual se calcula sobre el neto-promo (antes lo
            // reemplazaba). Espejo exacto de recalculateSale en saleCalc.ts.
            $best = $this->bestPromoBenefit(
                $promosByProduct[(int) $line['product_id']] ?? [],
                (float) $line['unit_price'],
                (float) $line['qty'],
            );
            $promoAmount = 0.0;
            if ($best !== null) {
                $benefitType    = 'promo';
                $promoAmount    = $best['amount'];
                $appliedPromoId = $best['promo_id'];
                $promoName      = $best['promo_name'];
                $promoFreeQty   = $best['free_qty'];
            }
            $baseAfterPromo = self::round2(max(0.0, $gross - $promoAmount));

            $manualAmount = 0.0;
            $discount = $line['line_discount'] ?? null;
            if (is_array($discount)) {
                $manualAmount = $this->lineDiscountAmount(
                    kind:      (string) $discount['kind'],
                    basis:     (string) $discount['basis'],
                    value:     (float) $discount['value'],
                    unitPrice: (float) $line['unit_price'],
                    qty:       (float) $line['qty'],
                    baseOverride: $baseAfterPromo,
                );
                if ($manualAmount > 0) {
                    // Con manual presente el type es 'discount' (compat con el
                    // enum); los campos promo_* quedan persistidos si aplicó.
                    $benefitType = 'discount';
                }
            }

            // discount_amount = beneficio TOTAL de la línea (promo + manual):
            // el rollup sales.discount y los netos de reportes siguen cuadrando.
            $discountAmount = self::round2($promoAmount + $manualAmount);

            $net = self::round2(max(0.0, $gross - $discountAmount));

            $resultLines[] = [
                'gross'                => $gross,
                'benefit_type'         => $benefitType,
                'discount_amount'      => $discountAmount,
                'applied_promotion_id' => $appliedPromoId,
                'promo_name'           => $promoName,
                'promo_free_qty'       => $promoFreeQty,
                // Snapshot directo del monto promo (2026-07-20): con el tipo
                // qty_discount ya no se puede derivar de promo_free_qty × price.
                'promo_amount'         => $best !== null ? $promoAmount : null,
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
     * Mejor beneficio de promo sobre una línea. Espejo de computePromoBenefit
     * en saleCalc.ts. Null si ninguna alcanza o son inválidas.
     *
     * - 'nxm': groups = floor(Q/N), gratis = groups × (N−M), resto a precio
     *   completo. free_qty > 0.
     * - 'qty_discount' (2026-07-20): escalones [{qty, amount}], GREEDY por
     *   grupos del escalón mayor al menor y SE REPITE (5 pzas con 2→100/3→400
     *   = 400 + 100). free_qty = 0 (no hay piezas gratis, es monto directo).
     *   Monto clampeado al bruto de la línea.
     *
     * @param array<int, \App\Models\ProductPromotion> $promos
     * @return array{amount: float, promo_id: int, promo_name: string, free_qty: int}|null
     */
    private function bestPromoBenefit(array $promos, float $unitPrice, float $qty): ?array
    {
        $best = null;

        foreach ($promos as $promo) {
            if (($promo->type ?? ProductPromotion::TYPE_NXM) === ProductPromotion::TYPE_QTY_DISCOUNT) {
                $amount = $this->qtyDiscountAmount((array) ($promo->tiers ?? []), $qty);
                $amount = min($amount, self::round2($unitPrice * $qty));
                if ($amount <= 0) {
                    continue;
                }
                $freeQty = 0;
            } else {
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
     * Descuento por cantidad con escalones, GREEDY: ordena escalones de mayor
     * a menor qty y consume la cantidad en grupos repetibles. 5 pzas con
     * [{2,100},{3,400}] → 1 grupo de 3 (−400) + 1 grupo de 2 (−100) = 500.
     * Espejo de qtyDiscountAmount en saleCalc.ts.
     *
     * @param array<int, array{qty?: int|string, amount?: int|float|string}> $tiers
     */
    private function qtyDiscountAmount(array $tiers, float $qty): float
    {
        $clean = [];
        foreach ($tiers as $tier) {
            $tQty    = (int) ($tier['qty'] ?? 0);
            $tAmount = (float) ($tier['amount'] ?? 0);
            if ($tQty >= 2 && $tAmount > 0) {
                $clean[] = ['qty' => $tQty, 'amount' => $tAmount];
            }
        }
        if ($clean === []) {
            return 0.0;
        }
        usort($clean, fn ($a, $b) => $b['qty'] <=> $a['qty']);

        $remaining = (int) floor($qty);
        $amount    = 0.0;
        foreach ($clean as $tier) {
            if ($remaining < $tier['qty']) {
                continue;
            }
            $groups     = intdiv($remaining, $tier['qty']);
            $amount    += $groups * $tier['amount'];
            $remaining -= $groups * $tier['qty'];
        }

        return self::round2($amount);
    }

    /**
     * Monto del descuento manual de una línea, clampeado a [0, base].
     * fixed+unit → value × qty · fixed+line → value · percent → base × value/100
     * (percent siempre sobre la base de la línea, igual que saleCalc.ts).
     */
    private function lineDiscountAmount(string $kind, string $basis, float $value, float $unitPrice, float $qty, ?float $baseOverride = null): float
    {
        // Stacking: la base del manual es el neto DESPUÉS de la promo.
        $base = $baseOverride ?? ($unitPrice * $qty);
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
