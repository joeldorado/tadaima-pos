<?php

namespace App\Services;

use App\Models\PreSaleOrder;
use App\Models\Sale;
use Illuminate\Support\Facades\DB;

/**
 * Cobro mixto de Caja en UNA transacción (2026-11-17, ticket T-006).
 *
 * Antes Caja hacía tres llamadas en serie (venta → preventa nueva → entrega del
 * folio): si la última fallaba, la venta ya estaba guardada y el cajero no lo
 * sabía. Aquí las tres van juntas: si cualquiera falla, no queda nada. Vale
 * igual para la mesa SIN folio que lleva producto + preventa nueva.
 *
 * No tiene reglas propias: llama a los servicios de siempre, que abren su
 * transacción dentro de esta (savepoints). Quien lo llame atrapa la
 * `DomainException` FUERA: atraparla aquí adentro dejaría confirmado lo que ya
 * se escribió.
 */
class MixedCheckoutService
{
    /**
     * Intentos de la transacción completa. Esta es la única que toma candados
     * de catálogos de preventa Y de inventario: dos cobros cruzados (uno
     * entrega del catálogo X y aparta del Y, el otro al revés, con el mismo
     * producto) pueden bloquearse entre sí. Postgres tumba a uno sin guardar
     * nada y Laravel lo repite solo; sin esto el cajero vería un error 500.
     */
    private const DEADLOCK_ATTEMPTS = 3;

    public function __construct(
        private readonly CheckoutService $checkoutService,
        private readonly PreSaleOrderService $preSaleOrderService,
    ) {
    }

    /**
     * Orden: primero el folio (es lo que falla cuando ya lo cobraron en otra
     * mesa, y falla sin haber tocado stock), luego la venta y al final la
     * preventa nueva, que se liga a la venta.
     *
     * @param  PreSaleOrder|null  $order  folio que se entrega; null si la mesa no trae folio cargado
     * @param  array<string, mixed>  $data  payload validado de `MixedCheckoutRequest`
     * @return array{sale: Sale|null, delivered_order: PreSaleOrder|null, new_order: PreSaleOrder|null}
     *
     * @throws \DomainException si cualquiera de los pasos no procede (nada queda guardado)
     */
    public function checkout(?PreSaleOrder $order, array $data, int $userId): array
    {
        return DB::transaction(fn (): array => $this->run($order, $data, $userId), self::DEADLOCK_ATTEMPTS);
    }

    /**
     * Los tres pasos, en orden. Corre SIEMPRE dentro de la transacción de
     * `checkout()`; si el motor la tumba por un candado cruzado, se repite entera.
     *
     * @param  array<string, mixed>  $data
     * @return array{sale: Sale|null, delivered_order: PreSaleOrder|null, new_order: PreSaleOrder|null}
     */
    private function run(?PreSaleOrder $order, array $data, int $userId): array
    {
        $liquidation = $data['liquidation'] ?? [];
        $storeId     = (int) $data['store_id'];
        $customerId  = isset($data['customer_id']) ? (int) $data['customer_id'] : null;

        $delivered = $order !== null
            ? $this->preSaleOrderService->liquidate(
                $order,
                $userId,
                $liquidation['notes'] ?? null,
                $liquidation['item_ids'] ?? null,
                $liquidation['payment'] ?? null,
                $liquidation['item_discounts'] ?? null,
            )
            : null;

        $sale = ! empty($data['sale'])
            ? $this->checkoutSale($data['sale'], $storeId, (int) $data['register_session_id'], $customerId, $userId)
            : null;

        $newOrder = ! empty($data['new_order'])
            ? $this->preSaleOrderService->createOrder([
                ...$data['new_order'],
                'store_id'       => $storeId,
                'customer_id'    => $customerId,
                'linked_sale_id' => $sale?->id,
            ], $userId)
            : null;

        return ['sale' => $sale, 'delivered_order' => $delivered, 'new_order' => $newOrder];
    }

    /** @param array<string, mixed> $sale */
    private function checkoutSale(array $sale, int $storeId, int $registerSessionId, ?int $customerId, int $userId): Sale
    {
        $money = static fn (string $key): ?float => isset($sale[$key]) ? (float) $sale[$key] : null;

        return $this->checkoutService->checkoutDirect(
            storeId:           $storeId,
            registerSessionId: $registerSessionId,
            customerId:        $customerId,
            items:             $sale['items'],
            paymentsData:      $sale['payments'],
            discount:          0.0,
            userId:            $userId,
            cashReceivedUsd:   $money('cash_received_usd'),
            exchangeRate:      $money('exchange_rate'),
            cashReceived:      $money('cash_received'),
            change:            $money('change_amount'),
            calcV2:            true,
        );
    }
}
