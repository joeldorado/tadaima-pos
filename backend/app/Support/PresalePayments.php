<?php

declare(strict_types=1);

namespace App\Support;

use App\Models\PaymentMethod;
use App\Services\SalePaymentRules;
use Illuminate\Support\Collection;

/**
 * Pagos de un cobro de preventa (anticipo o liquidación).
 *
 * Desde 2026-11-23 (autorizado por Pier) una preventa se cobra con cualquier
 * método, Tarjeta incluida, y también en Mixto (efectivo + transferencia). El
 * cobro puede venir de dos formas:
 *
 *  - Lista nueva `payments: [{amount, payment_method_id, terminal_id?}]`
 *    (máx. 2). La manda Caja web.
 *  - Campos de siempre (`advance_amount` + `payment_method_id`, o
 *    `payment {amount, payment_method_id}`). Los usa la app móvil: siguen igual.
 *
 * Dos pagos = Mixto: solo efectivo + transferencia, como en una venta (sin
 * tarjeta). La comisión se calcula igual que en ventas: % de la terminal.
 */
final class PresalePayments
{
    public const MAX_PAYMENTS = 2;

    private const TOLERANCE = 0.01;

    /**
     * Normaliza el cobro a una lista de pagos con su comisión.
     *
     * @param  array<int, array<string, mixed>>|null  $payments  lista nueva (manda si viene)
     * @param  float|null  $legacyAmount  monto de los campos de siempre
     * @param  int|null  $legacyMethodId  método de los campos de siempre
     * @return list<array{amount: float, payment_method_id: int|null, terminal_id: int|null, commission_amount: float}>
     *
     * @throws \DomainException
     */
    public static function normalize(?array $payments, ?float $legacyAmount, ?int $legacyMethodId): array
    {
        if ($payments === null || $payments === []) {
            $amount = round((float) ($legacyAmount ?? 0), 2);

            return $amount > 0
                ? [['amount' => $amount, 'payment_method_id' => $legacyMethodId, 'terminal_id' => null, 'commission_amount' => 0.0]]
                : [];
        }

        if (count($payments) > self::MAX_PAYMENTS) {
            throw new \DomainException('Un cobro de preventa lleva máximo dos pagos (Mixto).');
        }

        $rows = array_map(static fn (array $p): array => [
            'amount' => round((float) ($p['amount'] ?? 0), 2),
            'payment_method_id' => isset($p['payment_method_id']) ? (int) $p['payment_method_id'] : null,
            'terminal_id' => isset($p['terminal_id']) ? (int) $p['terminal_id'] : null,
        ], array_values($payments));

        $total = round(array_sum(array_column($rows, 'amount')), 2);
        if ($legacyAmount !== null && $legacyAmount > 0 && abs($total - $legacyAmount) > self::TOLERANCE) {
            throw new \DomainException(
                "Los pagos (\${$total}) no cuadran con el monto del cobro (\${$legacyAmount})."
            );
        }

        $methods = PaymentMethod::whereIn('id', array_filter(array_column($rows, 'payment_method_id')))
            ->get()
            ->keyBy('id');

        foreach ($rows as $row) {
            if ($row['amount'] <= 0) {
                throw new \DomainException('Cada pago del cobro debe ser mayor a $0.');
            }
            $method = $methods->get($row['payment_method_id']);
            if ($row['terminal_id'] !== null && ! ($method?->isCard() ?? false)) {
                throw new \DomainException('La terminal solo va con pago con Tarjeta.');
            }
        }

        if (count($rows) === 2) {
            self::assertMixto($rows, $methods);
        }

        [, $withCommission] = SalePaymentRules::calculateCommissions($rows);

        return array_map(static fn (array $r): array => [
            'amount' => $r['amount'],
            'payment_method_id' => $r['payment_method_id'],
            'terminal_id' => $r['terminal_id'],
            'commission_amount' => (float) $r['commission_amount'],
        ], $withCommission);
    }

    /** Suma de una lista ya normalizada. */
    public static function total(array $rows): float
    {
        return round(array_sum(array_column($rows, 'amount')), 2);
    }

    /**
     * Mixto = efectivo + transferencia, dos métodos distintos y sin tarjeta.
     *
     * @param  list<array{amount: float, payment_method_id: int|null, terminal_id: int|null}>  $rows
     * @param  Collection<int, PaymentMethod>  $methods
     */
    private static function assertMixto(array $rows, $methods): void
    {
        $ids = array_column($rows, 'payment_method_id');
        if (in_array(null, $ids, true) || $ids[0] === $ids[1]) {
            throw new \DomainException('El pago Mixto lleva dos métodos distintos: efectivo y transferencia.');
        }
        foreach ($ids as $id) {
            if ($methods->get($id)?->isCard()) {
                throw new \DomainException('El pago Mixto es solo efectivo + transferencia (sin tarjeta).');
            }
        }
    }
}
