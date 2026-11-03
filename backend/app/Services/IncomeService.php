<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\CashMovement;
use App\Models\IncomeMovement;
use App\Models\SystemLog;
use App\Models\User;
use Illuminate\Support\Facades\DB;

/**
 * Ingresos (Fase 3). La operación clave es el INGRESO pagado por efectivo del
 * cajón del usuario: crea el `cash_movements type='entrada'` y el
 * `income_movements` linkeado en UNA transacción (patrón ADR-016). Si algo
 * truena, no queda ni la entrada ni el movimiento — nunca un cajón descuadrado.
 *
 * El corte ya suma todas las entradas en expected_cash, así que el ingreso se
 * auto-balancea sin tocar la fórmula del reporte.
 */
class IncomeService
{
    public function __construct(
        private readonly CashRegisterService $cashService = new CashRegisterService(),
    ) {
    }

    /**
     * Registrar un ingreso de dinero (venta equipo, comisión, devolución proveedor, etc.).
     * Crea una ENTRADA de caja ligada y el registro del ingreso en UNA transacción atómica.
     *
     * @throws \DomainException si el usuario no tiene caja abierta
     */
    public function registerIncome(
        string $type,
        float $amount,
        ?string $description,
        int $userId,
        ?int $storeId = null,
    ): IncomeMovement {
        $session = $this->cashService->activeSession($userId);
        if (! $session) {
            throw new \DomainException(
                'Necesitas una caja abierta para registrar un ingreso (el efectivo entra a tu caja).'
            );
        }

        return DB::transaction(function () use ($type, $amount, $description, $userId, $session, $storeId) {
            $cashMovement = CashMovement::create([
                'register_session_id' => $session->id,
                'type'                => 'entrada',
                'amount'              => round($amount, 2),
                'description'         => "Ingreso: {$type}" . ($description ? " · {$description}" : ''),
            ]);

            return IncomeMovement::create([
                'register_session_id' => $session->id,
                'store_id'            => $storeId,
                'type'                => $type,
                'amount'              => round($amount, 2),
                'description'         => $description,
                'cash_movement_id'    => $cashMovement->id,
                'user_id'             => $userId,
            ]);
        });
    }

    /**
     * Borra un registro de ingreso (admin — limpieza de pruebas). Definitivo, sin
     * SoftDeletes: guarda snapshot en system_logs ANTES de borrar.
     *
     * Si el movimiento tenía `cash_movement_id`, también borra ESE `cash_movements`
     * — sin esto, la entrada de dinero seguiría sumada al esperado de ese corte aunque
     * el ingreso ya no exista, descuadrando el cajón.
     */
    public function deleteMovement(IncomeMovement $movement, User $by): void
    {
        DB::transaction(function () use ($movement, $by) {
            // Fresh load to ensure we have current data
            $movement = IncomeMovement::findOrFail($movement->id);

            SystemLog::write(
                'income_movement.deleted',
                sprintf(
                    'Ingreso borrado: %s · %s (%s)',
                    $movement->type,
                    number_format((float) $movement->amount, 2),
                    $movement->description ?? '(sin descripción)',
                ),
                $by->id,
                'income_movement',
                $movement->id,
                [
                    'type'                => $movement->type,
                    'amount'              => $movement->amount,
                    'description'         => $movement->description,
                    'store_id'            => $movement->store_id,
                    'register_session_id' => $movement->register_session_id,
                    'cash_movement_id'    => $movement->cash_movement_id,
                    'user_id'             => $movement->user_id,
                    'created_at'          => $movement->created_at?->toISOString(),
                ],
            );

            if ($movement->cash_movement_id) {
                CashMovement::where('id', $movement->cash_movement_id)->delete();
            }

            $movement->delete();
        });
    }
}
