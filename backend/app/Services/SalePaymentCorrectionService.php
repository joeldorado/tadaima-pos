<?php

declare(strict_types=1);

namespace App\Services;

use App\Exceptions\SalePaymentCorrectionForbidden;
use App\Models\CashRegisterSession;
use App\Models\Payment;
use App\Models\PaymentMethod;
use App\Models\ProductPromotion;
use App\Models\Sale;
use App\Models\SystemLog;
use App\Models\Terminal;
use App\Models\User;
use DomainException;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Corregir el MÉTODO DE PAGO de una venta ya cobrada (2026-09-30): el cajero
 * registró Efectivo y era Tarjeta, o al revés. No cambia montos ni productos,
 * solo cómo se pagó. Quién puede (caja de la venta abierta, o admin) lo decide
 * el controller; aquí van las reglas de negocio.
 *
 * - Pasar a EFECTIVO una venta de la caja de OTRA persona (más dinero esperado
 *   en un cajón ajeno) solo lo hace el dueño de esa caja, un gerente o un admin:
 *   si no, un cajero podría inventar efectivo en la caja de un compañero,
 *   cancelar en la suya y sacar ese dinero (el faltante le saldría al otro).
 * - Solo ventas `completed` sin cancelaciones: el reembolso de una cancelación
 *   ya se calculó con el pago original (porción en efectivo) y no se recalcula.
 * - Formas válidas: un método (Efectivo, Tarjeta o Transferencia) o Mixto =
 *   Efectivo + Transferencia. Sin dólares; la suma no cambia.
 * - Tarjeta con terminal activa de la tienda; la comisión se recalcula (la
 *   absorbe la tienda, nunca el cliente) y se revisan las restricciones de
 *   pago de producto/promo como al cobrar.
 * - El esperado del corte se recalcula solo (GET /reports/cash lee `payments`).
 * - Queda en system_logs ('sale.payment_changed') con el antes y el después.
 */
final class SalePaymentCorrectionService
{
    /** Formas permitidas (tipos ordenados alfabéticamente). */
    private const ALLOWED_SHAPES = [
        ['efectivo'],
        ['tarjeta'],
        ['transferencia'],
        ['efectivo', 'transferencia'],
    ];

    /**
     * @param list<array{payment_method_id: int, amount: float|int|string, terminal_id?: int|null}> $paymentsData
     *
     * @throws DomainException con mensaje legible (→ 422)
     */
    public function correct(Sale $sale, array $paymentsData, User $by, ?string $reason): Sale
    {
        return DB::transaction(function () use ($sale, $paymentsData, $by, $reason) {
            $sale = Sale::lockForUpdate()->findOrFail($sale->id);
            $this->assertCorrectable($sale);
            // Se relee con lock: no corregir mientras otro hace el corte de esa caja.
            $session = $sale->register_session_id
                ? CashRegisterSession::lockForUpdate()->find($sale->register_session_id)
                : null;
            $this->assertSessionAllows($session, $by);

            $old = $sale->payments()->with('paymentMethod')->get();
            if ($old->isEmpty()) {
                throw new DomainException('Esta venta no tiene pagos registrados; no se puede corregir.');
            }

            $rows = $this->normalizeRows($sale, $paymentsData);
            $this->assertSameTotal($rows, $sale);
            $this->assertCashOwnership($session, $by, $rows, $old);
            $this->assertNoUsdLeftInCash($sale, $rows);
            $this->assertChanged($rows, $old);
            $this->assertAllowedForItems($sale, $rows);

            [$commission, $withCommission] = SalePaymentRules::calculateCommissions($rows);
            $before = $this->snapshot($sale, $old);

            $this->replacePayments($sale, $old, $withCommission);
            $this->updateSaleCashFields($sale, $old, $rows, $commission);
            $this->log($sale->fresh(), $before, $by, $reason);

            return $sale->fresh();
        });
    }

    private function assertCorrectable(Sale $sale): void
    {
        if ($sale->status !== Sale::STATUS_COMPLETED) {
            throw new DomainException('Solo se corrige el pago de una venta vigente (esta ya está cancelada).');
        }
        if (($sale->cancellation_status ?? Sale::CANCELLATION_NONE) !== Sale::CANCELLATION_NONE) {
            throw new DomainException('Esta venta ya tiene cancelaciones: la devolución se calculó con el pago original y ya no se puede cambiar el método.');
        }
    }

    /** Caja de la venta abierta (cualquier rol) o admin. */
    private function assertSessionAllows(?CashRegisterSession $session, User $by): void
    {
        if ($by->isAdminRole() || $session?->status === CashRegisterSession::STATUS_OPEN) {
            return;
        }
        throw new SalePaymentCorrectionForbidden($session === null
            ? 'Esta venta no tiene caja asociada: solo un administrador puede corregir su pago.'
            : 'La caja de esta venta ya se cerró (corte hecho). Solo un administrador puede corregir el método de pago.');
    }

    /** Meter efectivo a la caja de otra persona: solo su dueño, gerente o admin. */
    private function assertCashOwnership(?CashRegisterSession $session, User $by, array $rows, Collection $old): void
    {
        $adds = self::cashOf($rows) > self::oldCashOf($old) + 0.005;
        $trusted = $by->isAdminRole() || $by->hasRole('gerente')
            || ($session !== null && (int) $session->user_id === (int) $by->id);
        if ($adds && ! $trusted) {
            throw new SalePaymentCorrectionForbidden('Pasar a efectivo una venta de la caja de otra persona solo lo puede hacer quien cobró, un gerente o un administrador.');
        }
    }

    /**
     * Valida forma y terminales; regresa los renglones limpios (sin terminal en
     * los que no son tarjeta) con su tipo.
     *
     * @return list<array{payment_method_id: int, terminal_id: int|null, amount: float, kind: string}>
     */
    private function normalizeRows(Sale $sale, array $paymentsData): array
    {
        $methods = PaymentMethod::whereIn('id', array_column($paymentsData, 'payment_method_id'))->get()->keyBy('id');

        $rows = array_map(function (array $p) use ($methods, $sale) {
            $kind = self::kindOf($methods[(int) $p['payment_method_id']]);
            $terminalId = $kind === 'tarjeta' ? $this->cardTerminalId($sale, $p['terminal_id'] ?? null) : null;

            return [
                'payment_method_id' => (int) $p['payment_method_id'],
                'terminal_id'       => $terminalId,
                'amount'            => round((float) $p['amount'], 2),
                'kind'              => $kind,
            ];
        }, array_values($paymentsData));

        $kinds = array_column($rows, 'kind');
        sort($kinds);
        if (! in_array($kinds, self::ALLOWED_SHAPES, true)) {
            throw new DomainException('Se corrige a un solo método (Efectivo, Tarjeta o Transferencia) o a Mixto = Efectivo + Transferencia.');
        }

        return $rows;
    }

    private function cardTerminalId(Sale $sale, mixed $terminalId): int
    {
        $terminal = $terminalId ? Terminal::find((int) $terminalId) : null;
        if ($terminal === null) {
            throw new DomainException('Para tarjeta elige la terminal con la que se cobró.');
        }
        if (! $terminal->active || (int) $terminal->store_id !== (int) $sale->store_id) {
            throw new DomainException('Esa terminal no está activa en la tienda de la venta.');
        }

        return (int) $terminal->id;
    }

    private static function kindOf(PaymentMethod $method): string
    {
        $name = mb_strtolower((string) $method->name);

        return match (true) {
            $method->isCard()                                            => 'tarjeta',
            str_contains($name, 'dolar') || str_contains($name, 'dólar') => 'dolares',
            $method->isCashLike()                                        => 'efectivo',
            str_contains($name, 'transfer')                              => 'transferencia',
            default                                                      => 'otro',
        };
    }

    /** Misma regla que el cobro: Σ pagos = total de la venta (±0.01), sin arrastrar centavos. */
    private function assertSameTotal(array $rows, Sale $sale): void
    {
        $newTotal = round(array_sum(array_column($rows, 'amount')), 2);
        $total    = round((float) $sale->total, 2);
        if (abs($newTotal - $total) > 0.01) {
            throw new DomainException(sprintf('El pago corregido debe sumar $%s, igual que lo cobrado.', number_format($total, 2)));
        }
    }

    /** Los dólares se capturan al cobrar; una corrección no puede dejarlos en efectivo. */
    private function assertNoUsdLeftInCash(Sale $sale, array $rows): void
    {
        if ((float) ($sale->cash_received_usd ?? 0) > 0 && self::cashOf($rows) > 0) {
            throw new DomainException('Esta venta se cobró con dólares: solo se puede corregir a Tarjeta o Transferencia.');
        }
    }

    private function assertChanged(array $rows, Collection $old): void
    {
        $signature = static fn (iterable $list): array => collect($list)
            ->map(fn ($p) => sprintf('%d|%d|%.2f', $p['payment_method_id'], (int) ($p['terminal_id'] ?? 0), (float) $p['amount']))
            ->sort()->values()->all();

        if ($signature($rows) === $signature($old->map(fn (Payment $p) => $p->only(['payment_method_id', 'terminal_id', 'amount'])))) {
            throw new DomainException('No hay cambios: la venta ya está registrada con ese pago.');
        }
    }

    /** Restricciones de pago de producto y de la promo aplicada, igual que al cobrar. */
    private function assertAllowedForItems(Sale $sale, array $rows): void
    {
        $items  = $sale->items()->with('product.paymentMethod')->get()->values();
        $promos = ProductPromotion::whereIn('id', $items->pluck('applied_promotion_id')->filter()->unique())->get()->keyBy('id');

        $lines = $items->map(function ($item) use ($promos) {
            $promo = $item->applied_promotion_id ? $promos->get($item->applied_promotion_id) : null;

            return [
                'applied_promotion_id' => $item->applied_promotion_id,
                'promo_name'           => $item->promo_name,
                'promo_allow_cash'     => $promo !== null ? (bool) $promo->allow_cash : true,
                'promo_allow_card'     => $promo !== null ? (bool) $promo->allow_card : true,
            ];
        })->all();

        SalePaymentRules::assertPaymentMethodsAllowed($items, $rows, $lines);
    }

    /** @param list<array<string, mixed>> $withCommission */
    private function replacePayments(Sale $sale, Collection $old, array $withCommission): void
    {
        $paidAt = $old->min('created_at');
        $sale->payments()->delete();

        foreach ($withCommission as $row) {
            $payment = new Payment([
                'sale_id'           => $sale->id,
                'payment_method_id' => $row['payment_method_id'],
                'terminal_id'       => $row['terminal_id'],
                'amount'            => $row['amount'],
                'commission_amount' => $row['commission_amount'],
            ]);
            $payment->created_at = $paidAt; // conserva la hora del cobro
            $payment->save();
        }
    }

    /** Comisión y datos de efectivo (recibido/cambio/dólares) acordes al pago nuevo. */
    private function updateSaleCashFields(Sale $sale, Collection $old, array $rows, float $commission): void
    {
        $newCash = self::cashOf($rows);
        $oldCash = self::oldCashOf($old);

        $fields = ['commission_amount' => $commission];
        if ($newCash <= 0) {
            $fields += ['cash_received' => null, 'change_amount' => null, 'cash_received_usd' => null, 'exchange_rate' => null];
        } elseif (abs($newCash - $oldCash) >= 0.005) {
            $fields += ['cash_received' => $newCash, 'change_amount' => 0];
        }

        $sale->forceFill($fields)->save();
    }

    /** Lo que entró al cajón con los pagos actuales (efectivo y dólares). */
    private static function oldCashOf(Collection $old): float
    {
        return round((float) $old->filter(fn (Payment $p) => $p->paymentMethod?->isCashLike() ?? false)->sum('amount'), 2);
    }

    private static function cashOf(array $rows): float
    {
        return round(array_sum(array_map(
            fn (array $r) => $r['kind'] === 'efectivo' ? $r['amount'] : 0.0,
            $rows,
        )), 2);
    }

    /** @return array<string, mixed> */
    private function snapshot(Sale $sale, Collection $payments): array
    {
        return [
            'payments' => $payments->map(fn (Payment $p) => [
                'method'            => $p->paymentMethod?->name,
                'payment_method_id' => $p->payment_method_id,
                'terminal_id'       => $p->terminal_id,
                'amount'            => (float) $p->amount,
                'commission_amount' => (float) $p->commission_amount,
            ])->values()->all(),
            'cash_received'     => $sale->cash_received,
            'change_amount'     => $sale->change_amount,
            'cash_received_usd' => $sale->cash_received_usd,
            'exchange_rate'     => $sale->exchange_rate,
            'commission_amount' => (float) $sale->commission_amount,
        ];
    }

    private function log(Sale $sale, array $before, User $by, ?string $reason): void
    {
        $after   = $this->snapshot($sale, $sale->payments()->with('paymentMethod')->get());
        $label   = static fn (array $snap): string => collect($snap['payments'])
            ->map(fn ($p) => sprintf('%s $%s', $p['method'] ?? '¿?', number_format($p['amount'], 2)))
            ->implode(' + ');
        $session = $sale->register_session_id ? CashRegisterSession::find($sale->register_session_id) : null;

        $from = $label($before);
        $to   = $label($after);

        SystemLog::write(
            'sale.payment_changed',
            "Venta #{$sale->id}: {$from} → {$to}",
            $by->id,
            'sale',
            $sale->id,
            [
                'before'       => $before,
                'after'        => $after,
                'session_id'   => $sale->register_session_id,
                'session_open' => $session?->status === CashRegisterSession::STATUS_OPEN,
                'reason'       => $reason,
            ],
        );
    }
}
