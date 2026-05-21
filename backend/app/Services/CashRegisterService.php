<?php

namespace App\Services;

use App\Models\CashMovement;
use App\Models\CashRegister;
use App\Models\CashRegisterSession;
use Illuminate\Support\Facades\DB;

class CashRegisterService
{
    // ─── Open session ─────────────────────────────────────────────────────────

    /**
     * Abre una sesión de caja para el usuario autenticado.
     *
     * Reglas:
     *  - El usuario no puede tener otra sesión abierta
     *  - La caja debe estar activa y sin sesión abierta
     *
     * @throws \DomainException
     */
    public function open(int $registerId, float $openingCash, int $userId): CashRegisterSession
    {
        return DB::transaction(function () use ($registerId, $openingCash, $userId) {
            // Verificar que el usuario no tiene sesión abierta
            $userSession = CashRegisterSession::where('user_id', $userId)
                ->where('status', CashRegisterSession::STATUS_OPEN)
                ->lockForUpdate()
                ->first();

            if ($userSession) {
                throw new \DomainException(
                    'Ya tienes una sesión de caja abierta (ID: ' . $userSession->id . '). Ciérrala antes de abrir otra.'
                );
            }

            // Verificar que la caja existe, está activa y no tiene sesión abierta
            $register = CashRegister::lockForUpdate()->findOrFail($registerId);

            if (! $register->active) {
                throw new \DomainException("La caja '{$register->name}' no está activa.");
            }

            $registerSession = CashRegisterSession::where('register_id', $registerId)
                ->where('status', CashRegisterSession::STATUS_OPEN)
                ->lockForUpdate()
                ->first();

            if ($registerSession) {
                throw new \DomainException("La caja '{$register->name}' ya tiene una sesión abierta.");
            }

            $session = CashRegisterSession::create([
                'register_id'  => $registerId,
                'user_id'      => $userId,
                'opened_at'    => now(),
                'opening_cash' => $openingCash,
                'status'       => CashRegisterSession::STATUS_OPEN,
            ]);

            return $session->load(['register', 'user', 'movements']);
        });
    }

    // ─── Close session ────────────────────────────────────────────────────────

    /**
     * Cierra la sesión de caja activa del usuario.
     *
     * @throws \DomainException
     */
    public function close(CashRegisterSession $session, float $closingCash): CashRegisterSession
    {
        return DB::transaction(function () use ($session, $closingCash) {
            $session = CashRegisterSession::lockForUpdate()->find($session->id);

            if ($session->status !== CashRegisterSession::STATUS_OPEN) {
                throw new \DomainException('La sesión de caja ya está cerrada.');
            }

            $session->update([
                'status'       => CashRegisterSession::STATUS_CLOSED,
                'closed_at'    => now(),
                'closing_cash' => $closingCash,
            ]);

            return $session->load(['register', 'user', 'movements']);
        });
    }

    // ─── Add movement ─────────────────────────────────────────────────────────

    /**
     * Registra un movimiento (entrada/salida/ajuste) en la sesión activa.
     *
     * @throws \DomainException
     */
    public function addMovement(CashRegisterSession $session, array $data): CashMovement
    {
        if ($session->status !== CashRegisterSession::STATUS_OPEN) {
            throw new \DomainException('No se pueden registrar movimientos en una sesión cerrada.');
        }

        return CashMovement::create([
            'register_session_id' => $session->id,
            'type'                => $data['type'],
            'amount'              => round((float) $data['amount'], 2),
            'description'         => $data['description'] ?? null,
        ]);
    }

    // ─── Active session ───────────────────────────────────────────────────────

    /**
     * Devuelve la sesión de caja activa para el usuario.
     *
     * Lógica (cambio 2026-05-20):
     *  1. Si el usuario tiene su propia sesión abierta → devuelve esa.
     *  2. Si no, y el usuario tiene una tienda asignada, devuelve la sesión
     *     abierta en cualquier caja de su tienda (puede haber sido abierta por
     *     admin u otro turno). Esto deja que un cajero "tome" la caja que
     *     dejó abierta el admin sin tener que pedirle que la cierre.
     *  3. Si el usuario es admin sin sesión propia → null (admin abre la suya).
     *
     * Nota: el ownership de la sesión (user_id) no cambia. Las ventas que cobre
     * el cajero igual se registran con su propio user_id en la tabla `sales`.
     */
    public function activeSession(int $userId): ?CashRegisterSession
    {
        $own = CashRegisterSession::with(['register', 'user', 'movements'])
            ->where('user_id', $userId)
            ->where('status', CashRegisterSession::STATUS_OPEN)
            ->first();

        if ($own) {
            return $own;
        }

        $user = \App\Models\User::find($userId);
        $storeId = $user?->store_id;
        if (! $storeId) {
            return null;
        }

        return CashRegisterSession::with(['register', 'user', 'movements'])
            ->whereHas('register', fn ($q) => $q->where('store_id', $storeId))
            ->where('status', CashRegisterSession::STATUS_OPEN)
            ->first();
    }
}
