<?php

namespace App\Exceptions;

/**
 * TadaimaUS — el email del checkout ya tiene cuenta de cliente.
 *
 * Extiende DomainException a propósito: si un catch genérico la atrapa antes
 * (p.ej. el de UsOrderController), degrada a un 422 normal en vez de un 500.
 * El controller la cachea PRIMERO para responder con `code: 'account_exists'`
 * y que el checkout pinte el CTA "Sign in to continue".
 */
class UsAccountExistsException extends \DomainException
{
    public function __construct()
    {
        parent::__construct('An account with this email already exists. Please sign in to place your order.');
    }
}
