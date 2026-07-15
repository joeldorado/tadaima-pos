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
     * Compra de insumo con efectivo de la caja del usuario.
     *
     * @throws \DomainException si el usuario no tiene caja abierta
     */
    public function registerPurchase(
        Supply $supply,
        float $quantity,
        float $amount,
        ?string $note,
        int $userId,
    ): SupplyMovement {
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
