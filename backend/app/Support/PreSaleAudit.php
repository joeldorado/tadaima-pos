<?php

declare(strict_types=1);

namespace App\Support;

use App\Models\PreSaleCatalog;
use App\Models\PreSaleDelivery;
use App\Models\PreSaleOrder;
use App\Models\PreSaleOrderItem;
use App\Models\SystemLog;

/**
 * Rastro en `system_logs` de lo que pasa con un catálogo de preventa y sus
 * partidas (2026-11-01). Antes solo se registraba cancelar; crear/editar el
 * catálogo (costo, cupos, límite por cliente), cambiarle el estado y entregar
 * una partida suelta no decían quién lo hizo. Los folios ya tienen su propia
 * bitácora (`pre_sale_order_logs`); esto cubre lo que vive FUERA del folio.
 *
 * Cada action nueva va también en `ActivityGroups::LOG_ACTIONS` (grupo
 * «preventa») para que Administración → Actividad la titule bien.
 */
final class PreSaleAudit
{
    /** Campos del catálogo cuyo cambio vale la pena registrar. */
    private const TRACKED = [
        'product_name', 'cost', 'margin_percent',
        'price_1', 'price_2', 'price_3', 'price_4', 'price_5',
        'advance_payment', 'preorder_limit', 'limit_per_customer',
        'arrival_date', 'pickup_deadline', 'category_id', 'supplier_id', 'product_id',
    ];

    /** Foto de lo que se audita: campos + cupos por tienda (`store_id => limit_qty`). */
    public static function snapshot(PreSaleCatalog $catalog): array
    {
        $fields = [];
        foreach (self::TRACKED as $field) {
            $fields[$field] = self::normalize($catalog->getAttribute($field));
        }

        return ['fields' => $fields, 'store_limits' => self::storeLimits($catalog)];
    }

    public static function created(PreSaleCatalog $catalog, int $userId): void
    {
        SystemLog::write(
            'pre_sale_catalog.created',
            "Catálogo «{$catalog->product_name}» creado",
            $userId,
            'pre_sale_catalog',
            $catalog->id,
            [
                'cost'               => $catalog->cost,
                'price_1'            => $catalog->price_1,
                'limit_per_customer' => $catalog->limit_per_customer,
                'status'             => $catalog->status,
                'store_limits'       => self::storeLimits($catalog),
            ],
        );
    }

    /** Diff antes/después; sin cambio real no escribe nada. */
    public static function updated(PreSaleCatalog $catalog, array $before, int $userId): void
    {
        $after   = self::snapshot($catalog);
        $changes = [];
        foreach ($after['fields'] as $field => $to) {
            $from = $before['fields'][$field] ?? null;
            if ($from !== $to) {
                $changes[$field] = ['from' => $from, 'to' => $to];
            }
        }

        $limits = [];
        foreach ($before['store_limits'] + $after['store_limits'] as $storeId => $_) {
            $from = $before['store_limits'][$storeId] ?? null;
            $to   = $after['store_limits'][$storeId] ?? null;
            if ($from !== $to) {
                $limits[(string) $storeId] = ['from' => $from, 'to' => $to];
            }
        }

        if ($changes === [] && $limits === []) {
            return;
        }

        SystemLog::write(
            'pre_sale_catalog.updated',
            "Catálogo «{$catalog->product_name}» editado",
            $userId,
            'pre_sale_catalog',
            $catalog->id,
            ['changes' => $changes, 'store_limits' => $limits],
        );
    }

    /**
     * Cambio de estado que NO es cancelar (cancelar ya lo registra
     * `PreSaleCatalogCancellationService`). `$ordersReady` son los folios que
     * pasaron a "listo" al marcar "llegó".
     */
    public static function statusChanged(PreSaleCatalog $catalog, string $from, string $to, array $ordersReady, int $userId): void
    {
        $description = "Catálogo «{$catalog->product_name}»: {$from} → {$to}";
        if ($ordersReady !== []) {
            $description .= sprintf(' (%d folio(s) a listo)', count($ordersReady));
        }

        SystemLog::write(
            'pre_sale_catalog.status_changed',
            $description,
            $userId,
            'pre_sale_catalog',
            $catalog->id,
            ['from' => $from, 'to' => $to, 'orders_ready' => array_values($ordersReady)],
        );
    }

    /** Entrega (o reverso de entrega) de UNA partida desde el folio. */
    public static function itemDelivery(PreSaleOrder $order, PreSaleOrderItem $item, string $status, int $userId): void
    {
        $delivered = $status === PreSaleOrderItem::STATUS_DELIVERED;
        $name      = $item->catalog?->product_name ?? "Partida #{$item->id}";

        SystemLog::write(
            $delivered ? 'pre_sale_order_item.delivered' : 'pre_sale_order_item.reverted',
            sprintf('%s %s × %d del folio %s', $delivered ? 'Entregado' : 'Entrega revertida:', $name, (int) $item->quantity, $order->code),
            $userId,
            'pre_sale_order',
            $order->id,
            [
                'item_id'             => $item->id,
                'pre_sale_catalog_id' => $item->pre_sale_catalog_id,
                'product_name'        => $name,
                'quantity'            => (int) $item->quantity,
                'store_id'            => $order->store_id,
            ],
        );
    }

    /**
     * Entrega de partidas elegida en Caja (2026-11-13): qué se llevó el cliente,
     * cuánto se cobró en esa visita y cuántas partidas siguen pendientes.
     *
     * @param  iterable<PreSaleOrderItem>  $items
     */
    public static function delivery(PreSaleOrder $order, PreSaleDelivery $delivery, iterable $items, int $pendingCount, int $userId): void
    {
        $names = [];
        $ids   = [];
        foreach ($items as $item) {
            $names[] = ($item->catalog?->product_name ?? "Partida #{$item->id}") . ' × ' . (int) $item->quantity;
            $ids[]   = $item->id;
        }

        SystemLog::write(
            'pre_sale_order.delivery',
            sprintf(
                '%s del folio %s: %s · cobrado $%s%s',
                $pendingCount > 0 ? 'Entrega parcial' : 'Entrega',
                $order->code,
                implode(', ', $names),
                number_format((float) $delivery->amount, 2),
                $pendingCount > 0 ? " · {$pendingCount} pendiente(s)" : '',
            ),
            $userId,
            'pre_sale_order',
            $order->id,
            [
                'delivery_id'   => $delivery->id,
                'payment_id'    => $delivery->payment_id,
                'amount'        => (float) $delivery->amount,
                'item_ids'      => $ids,
                'pending_items' => $pendingCount,
                'store_id'      => $order->store_id,
            ],
        );
    }

    /** @return array<int, int> `store_id => limit_qty` */
    private static function storeLimits(PreSaleCatalog $catalog): array
    {
        $limits = [];
        foreach ($catalog->storeLimits()->get(['store_id', 'limit_qty']) as $l) {
            $limits[(int) $l->store_id] = (int) $l->limit_qty;
        }
        ksort($limits);

        return $limits;
    }

    /** Fechas a Y-m-d y floats redondeados, para que un diff sin cambio real salga vacío. */
    private static function normalize(mixed $value): mixed
    {
        if ($value instanceof \DateTimeInterface) {
            return $value->format('Y-m-d');
        }
        if (is_float($value)) {
            return round($value, 2);
        }

        return $value;
    }
}
