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
     *   skip_promotion?: bool,
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

        // MIX & MATCH (Joel 2026-07-23): las líneas de productos asignados a la
        // misma promo forman un POOL — 1 pieza de A + 1 de B sí disparan el 2x1
        // asignado a ambos. El reparto por línea sale de aquí; el loop de abajo
        // (stacking, snapshot, rollups) queda casi intacto.
        $poolBenefits = $this->assignPoolBenefits($lines, $promosByProduct);

        $resultLines = [];
        $subtotal    = 0.0;
        $netSum      = 0.0;

        foreach ($lines as $idx => $line) {
            $gross = self::round2((float) $line['unit_price'] * (float) $line['qty']);

            $benefitType    = null;
            $discountAmount = 0.0;
            $appliedPromoId = null;
            $promoName      = null;
            $promoFreeQty   = null;

            // STACKING (Joel 2026-07-17): la promo aplica SIEMPRE que alcance;
            // el descuento manual se calcula sobre el neto-promo (antes lo
            // reemplazaba). Espejo exacto de recalculateSale en saleCalc.ts.
            // El beneficio por línea ahora viene del reparto de pools —
            // `skip_promotion` ya quedó excluido del pool en el Paso 0.
            $best = $poolBenefits[$idx] ?? null;
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
     * MIX & MATCH (Joel 2026-07-23) — reparto de beneficios por POOL.
     *
     * Las líneas de productos asignados a la MISMA promo forman un pool y sus
     * cantidades se combinan. Espejo EXACTO de assignPoolBenefits en
     * saleCalc.ts — si tocas un paso aquí, tócalo allá o el checkout da 422.
     *
     * Paso 1 — unidades enteras: units = floor(qty) por línea; una línea sin
     *   unidades enteras (qty fraccionaria pura) NO entra a ningún pool.
     *   Con UNA sola línea el pool degenera exacto al comportamiento anterior:
     *   floor((k+f)/N) === floor(floor(k+f)/N) para k,N enteros y 0≤f<1.
     *
     * Paso 2 — greedy por promo, repetir mientras alguna rinda > 0:
     *   · NxM: U = Σ units del pool → free_total = floor(U/buy_n)×(buy_n−pay_m).
     *     Las piezas GRATIS van a las unidades MÁS BARATAS del pool (convención
     *     retail — protege a la tienda con precios distintos). Orden
     *     determinista: precio efectivo asc → product_id asc → índice asc.
     *   · Mayoreo: U ≥ min_qty → CADA línea del pool recibe
     *     min(round2(units×per_unit), bruto real de la línea) — clamp como hoy.
     *   · Gana el pool con: ahorro desc → priority desc → id asc (mismo
     *     desempate que el bestPromoBenefit que este método reemplaza).
     *   · Al aplicar, TODAS las líneas del pool quedan consumidas — también
     *     las contribuyentes sin descuento (si reentraran, doble-contarían).
     *     Una línea = una promo.
     *
     * @param array<int, array<string, mixed>> $lines Las líneas de calculate().
     * @param array<int, array<int, ProductPromotion>> $promosByProduct Promos
     *   por producto, ya con el override local aplicado.
     * @return array<int, array{amount: float, promo_id: int, promo_name: string, free_qty: int}>
     *   Mapa índice-de-línea → beneficio (solo líneas beneficiadas).
     */
    private function assignPoolBenefits(array $lines, array $promosByProduct): array
    {
        // Paso 0 — candidatas por línea (ids de promo) + catálogo por id.
        // Copias del mismo id (promo asignada a varios productos) colapsan:
        // los campos de la matemática son idénticos entre copias.
        $candidateIdsByLine = [];
        $promoById = [];
        foreach ($lines as $idx => $line) {
            $units = (int) floor((float) $line['qty']);
            if (($line['skip_promotion'] ?? false) || $units < 1) {
                $candidateIdsByLine[$idx] = [];
                continue;
            }
            $ids = [];
            foreach ($promosByProduct[(int) $line['product_id']] ?? [] as $promo) {
                $ids[] = (int) $promo->id;
                $promoById[(int) $promo->id] ??= $promo;
            }
            $candidateIdsByLine[$idx] = $ids;
        }

        $consumed = [];
        $benefits = [];

        while (true) {
            // Promos con al menos una línea candidata viva, en orden de id
            // (la iteración es determinista; el ganador lo decide el comparador).
            $liveIds = [];
            foreach ($candidateIdsByLine as $idx => $ids) {
                if (isset($consumed[$idx])) {
                    continue;
                }
                foreach ($ids as $id) {
                    $liveIds[$id] = true;
                }
            }
            if ($liveIds === []) {
                break;
            }
            $liveIds = array_keys($liveIds);
            sort($liveIds);

            $best = null;
            foreach ($liveIds as $promoId) {
                $promo = $promoById[$promoId];
                $poolIdxs = [];
                foreach ($candidateIdsByLine as $idx => $ids) {
                    if (! isset($consumed[$idx]) && in_array($promoId, $ids, true)) {
                        $poolIdxs[] = $idx;
                    }
                }
                if ($poolIdxs === []) {
                    continue;
                }

                $perLine = $this->poolBenefitPerLine($promo, $lines, $poolIdxs);
                if ($perLine === null) {
                    continue;
                }

                $amountPool = 0.0;
                foreach ($perLine as $entry) {
                    $amountPool += $entry['amount'];
                }
                $amountPool = self::round2($amountPool);
                if ($amountPool <= 0) {
                    continue;
                }

                $candidate = [
                    'promo'    => $promo,
                    'amount'   => $amountPool,
                    'priority' => (int) $promo->priority,
                    'id'       => $promoId,
                    'per_line' => $perLine,
                    'pool'     => $poolIdxs,
                ];
                if (
                    $best === null
                    || $candidate['amount'] > $best['amount']
                    || ($candidate['amount'] === $best['amount']
                        && ($candidate['priority'] > $best['priority']
                            || ($candidate['priority'] === $best['priority'] && $candidate['id'] < $best['id'])))
                ) {
                    $best = $candidate;
                }
            }

            if ($best === null) {
                break;
            }

            foreach ($best['per_line'] as $idx => $entry) {
                if ($entry['amount'] > 0) {
                    $benefits[$idx] = [
                        'amount'     => $entry['amount'],
                        'promo_id'   => (int) $best['promo']->id,
                        'promo_name' => (string) $best['promo']->name,
                        'free_qty'   => $entry['free_qty'],
                    ];
                }
            }
            foreach ($best['pool'] as $idx) {
                $consumed[$idx] = true;
            }
        }

        return $benefits;
    }

    /**
     * Beneficio de UNA promo sobre su pool, repartido por línea. Null si la
     * promo no alcanza a disparar con las cantidades combinadas.
     *
     * @param array<int, int> $poolIdxs Índices de línea del pool.
     * @return array<int, array{amount: float, free_qty: int}>|null
     */
    private function poolBenefitPerLine(ProductPromotion $promo, array $lines, array $poolIdxs): ?array
    {
        $totalUnits = 0;
        foreach ($poolIdxs as $idx) {
            $totalUnits += (int) floor((float) $lines[$idx]['qty']);
        }
        if ($totalUnits < 1) {
            return null;
        }

        if (($promo->type ?? ProductPromotion::TYPE_NXM) === ProductPromotion::TYPE_QTY_DISCOUNT) {
            $minQty  = $promo->min_qty !== null ? (int) $promo->min_qty : null;
            $perUnit = $promo->discount_per_unit !== null ? (float) $promo->discount_per_unit : null;
            if ($minQty === null || $minQty < 2 || $perUnit === null || $perUnit <= 0) {
                return null;
            }
            if ($totalUnits < $minQty) {
                return null;
            }

            $perLine = [];
            foreach ($poolIdxs as $idx) {
                $units = (int) floor((float) $lines[$idx]['qty']);
                // Clamp al bruto REAL (qty con fracción): igual que siempre.
                $gross  = self::round2((float) $lines[$idx]['unit_price'] * (float) $lines[$idx]['qty']);
                $amount = min(self::round2($units * $perUnit), $gross);
                $perLine[$idx] = ['amount' => max(0.0, $amount), 'free_qty' => 0];
            }

            return $perLine;
        }

        $buyN = (int) $promo->buy_n;
        $payM = (int) $promo->pay_m;
        if ($buyN < 1 || $payM < 1 || $payM >= $buyN) {
            return null;
        }
        $freeTotal = (int) floor($totalUnits / $buyN) * ($buyN - $payM);
        if ($freeTotal < 1) {
            return null;
        }

        // Las gratis caen en las unidades MÁS BARATAS. Desempates clavados
        // (idénticos en saleCalc.ts o los motores divergen centavo a centavo):
        // precio efectivo asc → product_id numérico asc → índice posicional asc.
        $order = $poolIdxs;
        usort($order, function (int $a, int $b) use ($lines): int {
            $priceCmp = (float) $lines[$a]['unit_price'] <=> (float) $lines[$b]['unit_price'];
            if ($priceCmp !== 0) {
                return $priceCmp;
            }
            $productCmp = (int) $lines[$a]['product_id'] <=> (int) $lines[$b]['product_id'];
            if ($productCmp !== 0) {
                return $productCmp;
            }

            return $a <=> $b;
        });

        $perLine   = [];
        $remaining = $freeTotal;
        foreach ($order as $idx) {
            $units = (int) floor((float) $lines[$idx]['qty']);
            $take  = min($units, $remaining);
            $remaining -= $take;
            $perLine[$idx] = [
                'amount'   => $take > 0 ? self::round2($take * (float) $lines[$idx]['unit_price']) : 0.0,
                'free_qty' => $take,
            ];
        }

        return $perLine;
    }

    /**
     * MAYOREO (2026-07-23): al alcanzar `minQty` piezas, TODAS las piezas de la
     * línea reciben `perUnit` de descuento. 5 pzas con (min 5, −$100) = −$500;
     * 7 pzas = −$700; 4 pzas = $0.
     *
     * `floor` para el umbral Y para el multiplicador: media pieza no gana
     * descuento (la API acepta cantidades fraccionarias). El clamp al bruto lo
     * aplica el llamador. Espejo exacto de `mayoreoAmount` en saleCalc.ts.
     *
     * Reemplazó al modelo por grupos con escalones (`tiers`), que daba −$X por
     * cada grupo completo de N y nada al remanente.
     */
    private function mayoreoAmount(?int $minQty, ?float $perUnit, float $qty): float
    {
        if ($minQty === null || $minQty < 2 || $perUnit === null || $perUnit <= 0) {
            return 0.0;
        }

        $units = (int) floor($qty);
        if ($units < $minQty) {
            return 0.0;
        }

        return self::round2($units * $perUnit);
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
