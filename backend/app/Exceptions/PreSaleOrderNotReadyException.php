<?php

namespace App\Exceptions;

/**
 * El folio (o una de sus partidas) ya no se puede entregar: alguien lo entregó,
 * lo canceló o el carrito de Caja quedó viejo.
 *
 * Extiende `DomainException` a propósito: los endpoints de siempre lo siguen
 * atrapando igual (422 con el mismo mensaje). El cobro mixto (`POST
 * /sales/mixed`) lo distingue para mandar un código y que Caja quite el folio
 * de la mesa en vez de dejar que lo cobren otra vez (2026-11-17, T-006).
 */
class PreSaleOrderNotReadyException extends \DomainException
{
    public const CODE_ALREADY_DELIVERED = 'PRESALE_ORDER_ALREADY_DELIVERED';
    public const CODE_NOT_READY         = 'PRESALE_ORDER_NOT_READY';

    public function __construct(string $message, public readonly bool $alreadyDelivered = false)
    {
        parent::__construct($message);
    }

    public function errorCode(): string
    {
        return $this->alreadyDelivered ? self::CODE_ALREADY_DELIVERED : self::CODE_NOT_READY;
    }
}
