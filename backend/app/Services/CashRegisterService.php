<?php

namespace App\Services;

use App\Exceptions\CashSessionConflictException;
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
     * Modelo "una caja por persona" (sesión = caja, 2026-05-30):
     *  - El usuario no puede tener otra sesión abierta (1 corte activo por persona).
     *  - La caja debe estar activa.
     *  - VARIOS usuarios pueden tener sesión abierta en la MISMA caja al mismo
     *    tiempo. Cada sesión es un corte independiente (su propio fondo inicial,
     *    movimientos y cierre). Así un cajero, un gerente y el admin pueden
     *    vender en paralelo en la misma tienda sin bloquearse entre sí.
     *
     * La tienda se resuelve por `store_id` (lo que la UI siempre conoce) o,
     * por compatibilidad, deduciéndola de un `register_id` existente. Esto
     * rompe el deadlock huevo-gallina: una tienda recién creada NO tiene caja
     * todavía (el seeder de prod no las crea, y `StoreController::store` solo
     * crea el warehouse), así que abrir por `register_id` era imposible —
     * nadie podía abrir caja en una tienda nueva. Con `store_id` la caja
     * personal se crea aquí mismo (`firstOrCreate`).
     *
     * @throws \DomainException
     */
    public function open(?int $registerId, float $openingCash, int $userId, ?int $storeId = null): CashRegisterSession
    {
        return DB::transaction(function () use ($registerId, $openingCash, $userId, $storeId) {
            // Verificar que el usuario no tiene sesión abierta. Si la tiene,
            // devolvemos info estructurada para que el frontend ofrezca
            // "reanudar" (misma caja) o "cerrar y abrir nueva" (otra caja).
            $userSession = CashRegisterSession::where('user_id', $userId)
                ->where('status', CashRegisterSession::STATUS_OPEN)
                ->with(['register.store', 'user:id,name'])
                ->lockForUpdate()
                ->first();

            if ($userSession) {
                throw new CashSessionConflictException(
                    CashSessionConflictException::KIND_OWN,
                    $userSession,
                );
            }

            // Resolver la TIENDA. En el modelo "una caja por persona" cada
            // usuario abre/reutiliza su PROPIA caja (sesión = caja), nombrada
            // "{usuario} · {tienda}". Preferimos `store_id` directo; si no
            // viene, lo deducimos de un `register_id` existente (compat).
            if ($storeId) {
                $resolvedStoreId = $storeId;
            } elseif ($registerId) {
                $resolvedStoreId = CashRegister::findOrFail($registerId)->store_id;
            } else {
                throw new \DomainException('Falta la tienda para abrir la caja.');
            }

            if (! $resolvedStoreId) {
                throw new \DomainException('La caja seleccionada no tiene tienda.');
            }

            $store = \App\Models\Store::find($resolvedStoreId);
            if (! $store) {
                throw new \DomainException('La tienda no existe.');
            }

            $user = \App\Models\User::find($userId);
            $desiredName = trim(($user?->name ?? 'Caja') . ' · ' . ($store?->name ?? ''), " ·");

            $register = CashRegister::firstOrCreate(
                ['store_id' => $resolvedStoreId, 'owner_user_id' => $userId],
                ['name' => $desiredName !== '' ? $desiredName : 'Caja', 'active' => true],
            );

            // Mantener el nombre al día si cambió el nombre del usuario o la tienda.
            if ($desiredName !== '' && $register->name !== $desiredName) {
                $register->update(['name' => $desiredName]);
            }

            $session = CashRegisterSession::create([
                'register_id'  => $register->id,
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
    public function close(CashRegisterSession $session, float $closingCash, ?string $localDate = null): CashRegisterSession
    {
        return DB::transaction(function () use ($session, $closingCash, $localDate) {
            $session = CashRegisterSession::lockForUpdate()->find($session->id);

            if ($session->status !== CashRegisterSession::STATUS_OPEN) {
                throw new \DomainException('La sesión de caja ya está cerrada.');
            }

            $session->update([
                'status'       => CashRegisterSession::STATUS_CLOSED,
                'closed_at'    => now(),
                // Día de negocio del corte: lo manda la UI (zona del
                // dispositivo del cajero). Fallback: zona del negocio
                // (force-close y clientes viejos sin el campo).
                'local_date'   => $localDate ?? now(\App\Support\DateRange::timezone())->toDateString(),
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
     * Devuelve la sesión de caja activa del usuario (solo la suya).
     *
     * Modelo "una caja por persona" (2026-05-30): cada usuario opera su propia
     * sesión/corte. Se ELIMINÓ la "apropiación por tienda" (un usuario tomaba
     * la sesión que otro dejó abierta), porque hacía que un segundo cajero o el
     * gerente quedaran atrapados en el corte ajeno en vez de abrir el suyo.
     * Ahora: si el usuario no tiene sesión propia abierta → null (abre la suya).
     */
    public function activeSession(int $userId): ?CashRegisterSession
    {
        return CashRegisterSession::with(['register', 'user', 'movements'])
            ->where('user_id', $userId)
            ->where('status', CashRegisterSession::STATUS_OPEN)
            ->first();
    }
}
