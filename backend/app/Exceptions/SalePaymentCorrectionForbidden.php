<?php

namespace App\Exceptions;

/**
 * Corregir el pago de una venta (2026-09-30): quien lo intenta no tiene
 * permiso para ESTE cambio (caja cerrada, o meter efectivo a la caja de otro).
 *
 * Extiende DomainException a propósito: si un catch genérico la atrapa antes,
 * degrada a un 422 en vez de un 500. El controller la atrapa PRIMERO → 403.
 */
class SalePaymentCorrectionForbidden extends \DomainException
{
}
