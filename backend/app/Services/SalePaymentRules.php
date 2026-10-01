<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\PaymentMethod;
use App\Models\Terminal;
use Illuminate\Support\Collection;

/**
 * Reglas de pago compartidas por el cobro (CheckoutService) y la corrección del
 * método de pago de una venta ya cobrada (SalePaymentCorrectionService,
 * 2026-09-30): restricciones de pago por producto/promo y comisión de terminal.
 */
final class SalePaymentRules
{
    /**
     * Calcula las comisiones por terminal para cada pago.
     *
     * @return array{float, array}  [totalCommission, paymentsWithCommission]
     */
    public static function calculateCommissions(array $paymentsData): array
    {
        $totalCommission = 0.0;
        $result          = [];

        foreach ($paymentsData as $payment) {
            $commission = 0.0;

            if (! empty($payment['terminal_id'])) {
                $terminal = Terminal::find($payment['terminal_id']);
                if ($terminal) {
                    $commission = round($payment['amount'] * $terminal->commission_percent / 100, 2);
                }
            }

            $totalCommission += $commission;
            $result[] = array_merge($payment, ['commission_amount' => $commission]);
        }

        return [round($totalCommission, 2), $result];
    }

    /**
     * Guard server-side de restricciones de pago por producto (QA crítico
     * 2026-06-08): un producto con allow_card=false NO puede cobrarse con
     * tarjeta, y uno con allow_cash=false NO con efectivo/transferencia.
     * Antes solo la UI lo validaba (y tenía el mapeo roto) — el backend
     * aceptaba cualquier combinación. La clasificación tarjeta/efectivo es
     * por nombre del método ("Tarjeta Débito"/"Tarjeta Crédito" del seeder).
     *
     * Desde 2026-07-24 valida también la restricción de la PROMO aplicada a esa
     * línea, con la misma consecuencia (bloquea el cobro). Solo bloquea si la
     * promo REALMENTE aplicó: la restricción es propiedad del beneficio
     * otorgado, no del producto — si el cliente lleva 1 pieza y el 2x1 no
     * disparó, no hay nada que restringir.
     *
     * @param array<int, array<string, mixed>>|null $v2Lines Líneas ya calculadas,
     *        en el MISMO orden que $draftItems (invariante verificado por el
     *        caller). Null en la ruta clásica (calc_version != 2), donde no se
     *        aplica ninguna promo y por tanto no hay nada que restringir.
     *
     * @throws \DomainException con mensaje legible
     */
    public static function assertPaymentMethodsAllowed(
        Collection $draftItems,
        array $paymentsData,
        ?array $v2Lines = null,
    ): void {
        $methodIds = array_values(array_unique(array_column($paymentsData, 'payment_method_id')));
        $methods   = PaymentMethod::whereIn('id', $methodIds)->get()->keyBy('id');

        $usesCard = false;
        $usesCash = false;
        foreach ($methodIds as $id) {
            if ($methods[$id]?->isCard()) {
                $usesCard = true;
            } else {
                $usesCash = true; // efectivo, dólares, transferencia, etc.
            }
        }

        // ->values() para que el índice case posicionalmente con $v2Lines.
        foreach ($draftItems->values() as $idx => $item) {
            $restriction = $item->product?->paymentMethod;
            $allowCash   = $restriction?->allow_cash ?? true;
            $allowCard   = $restriction?->allow_card ?? true;
            $name        = $item->product?->name ?? "Producto #{$item->product_id}";

            if ($usesCard && ! $allowCard) {
                throw new \DomainException("\"{$name}\" solo acepta efectivo — no se puede cobrar con tarjeta.");
            }
            if ($usesCash && ! $allowCash) {
                throw new \DomainException("\"{$name}\" solo acepta tarjeta — no se puede cobrar en efectivo/transferencia.");
            }

            // Promo APLICADA a esta línea (null si no alcanzó a disparar).
            $line = $v2Lines[$idx] ?? null;
            if (($line['applied_promotion_id'] ?? null) === null) {
                continue;
            }
            $promoName = $line['promo_name'] ?? 'la promoción';

            if ($usesCard && ($line['promo_allow_card'] ?? true) === false) {
                throw new \DomainException("La promo \"{$promoName}\" de \"{$name}\" es solo en efectivo. Cobra en efectivo, cobra sin la promo, o quita el artículo.");
            }
            if ($usesCash && ($line['promo_allow_cash'] ?? true) === false) {
                throw new \DomainException("La promo \"{$promoName}\" de \"{$name}\" es solo con tarjeta. Cobra con tarjeta, cobra sin la promo, o quita el artículo.");
            }
        }
    }
}
