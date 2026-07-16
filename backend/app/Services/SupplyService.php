<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\CashMovement;
use App\Models\Supply;
use App\Models\SupplyMovement;
use Illuminate\Support\Facades\DB;

/**
 * Insumos (Fase 2). La operación clave es la COMPRA pagada con efectivo de la
 * caja: crea el `cash_movements type='salida'` y el `supply_movements` linkeado
 * en UNA transacción (patrón ADR-016 del reverso de cancelaciones). Si algo
 * truena, no queda ni la salida ni el movimiento — nunca un cajón descuadrado.
 *
 * El corte ya resta todas las salidas en expected_cash, así que la compra se
 * auto-balancea sin tocar la fórmula del reporte.
 */
class SupplyService
{
    public function __construct(
        private readonly CashRegisterService $cashService = new CashRegisterService(),
    ) {
    }

    /**
     * Compra de insumo. Según el ORIGEN del dinero:
     * - 'caja' (default): efectivo del cajón del usuario → exige caja abierta y
     *   crea la salida ligada (camino histórico, el corte la refleja).
     * - 'caja_chica' / 'propio': el dinero NO salió de ningún cajón → sin sesión,
     *   sin cash_movement; queda solo el registro con su origen (y el nombre de
     *   quién puso el dinero cuando es propio).
     *
     * @throws \DomainException si origen=caja y el usuario no tiene caja abierta
     */
    public function registerPurchase(
        Supply $supply,
        float $quantity,
        float $amount,
        ?string $note,
        int $userId,
        string $moneySource = SupplyMovement::SOURCE_CAJA,
        ?string $payerName = null,
    ): SupplyMovement {
        if ($moneySource !== SupplyMovement::SOURCE_CAJA) {
            return SupplyMovement::create([
                'supply_id'    => $supply->id,
                'type'         => SupplyMovement::TYPE_PURCHASE,
                'quantity'     => round($quantity, 2),
                'amount'       => round($amount, 2),
                'note'         => $note,
                'money_source' => $moneySource,
                'payer_name'   => $moneySource === SupplyMovement::SOURCE_PROPIO ? $payerName : null,
                'user_id'      => $userId,
            ]);
        }

        $session = $this->cashService->activeSession($userId);
        if (! $session) {
            throw new \DomainException(
                'Necesitas una caja abierta para registrar una compra de insumo (el efectivo sale de tu caja).'
            );
        }

        return DB::transaction(function () use ($supply, $quantity, $amount, $note, $userId, $session) {
            $cashMovement = CashMovement::create([
                'register_session_id' => $session->id,
                'type'                => 'salida',
                'amount'              => round($amount, 2),
                'description'         => "Insumo: {$supply->name}" . ($note ? " · {$note}" : ''),
            ]);

            return SupplyMovement::create([
                'supply_id'           => $supply->id,
                'type'                => SupplyMovement::TYPE_PURCHASE,
                'quantity'            => round($quantity, 2),
                'amount'              => round($amount, 2),
                'note'                => $note,
                'money_source'        => SupplyMovement::SOURCE_CAJA,
                'register_session_id' => $session->id,
                'cash_movement_id'    => $cashMovement->id,
                'user_id'             => $userId,
            ]);
        });
    }

    /**
     * Consumo o ajuste — control de stock/costo del insumo, NO toca caja.
     */
    public function registerNonCashMovement(
        Supply $supply,
        string $type,
        float $quantity,
        float $amount,
        ?string $note,
        int $userId,
    ): SupplyMovement {
        return SupplyMovement::create([
            'supply_id' => $supply->id,
            'type'      => $type,
            'quantity'  => round($quantity, 2),
            'amount'    => round($amount, 2),
            'note'      => $note,
            'user_id'   => $userId,
        ]);
    }
}
