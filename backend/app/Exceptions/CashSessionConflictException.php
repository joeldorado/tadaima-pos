<?php

declare(strict_types=1);

namespace App\Exceptions;

use App\Models\CashRegisterSession;

/**
 * Conflicto al abrir caja: ya existe una sesión activa que bloquea la apertura.
 *
 * Dos tipos:
 *  - `KIND_OWN`     → el usuario mismo tiene otra sesión abierta (puede
 *                     reanudarla si la pidió en la misma caja, o cerrarla
 *                     para abrir otra).
 *  - `KIND_FOREIGN` → la caja específica está ocupada por OTRO usuario
 *                     (caso típico: sesión colgada que admin debe forzar).
 *
 * El controller la traduce a HTTP 409 con shape estructurado para que el
 * frontend distinga entre los dos modales (Resume vs Conflict).
 */
class CashSessionConflictException extends \RuntimeException
{
    public const KIND_OWN     = 'own';
    public const KIND_FOREIGN = 'foreign';

    public function __construct(
        public readonly string $kind,
        public readonly CashRegisterSession $existingSession,
        string $message = '',
    ) {
        parent::__construct($message ?: $this->defaultMessage());
    }

    private function defaultMessage(): string
    {
        return match ($this->kind) {
            self::KIND_OWN     => 'Ya tienes una sesión de caja abierta.',
            self::KIND_FOREIGN => 'Esta caja está abierta por otro usuario.',
        };
    }
}
