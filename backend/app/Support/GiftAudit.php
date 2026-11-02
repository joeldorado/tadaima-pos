<?php

declare(strict_types=1);

namespace App\Support;

use App\Models\Sale;
use App\Models\SaleGift;
use App\Models\SaleItem;
use App\Models\SystemLog;

/**
 * Rastro en `system_logs` de los regalos de Caja (2026-11-02): Administración →
 * Actividad filtra por «Regalos» y por usuario para ver quién dio qué. El detalle
 * de la venta vive en `sale_gifts`; esto es el historial, y sobrevive aunque la
 * línea se cancele (la fila de `sale_gifts` se va por cascade).
 *
 * `entity_type = product` para que el filtro por producto los encuentre.
 * `meta.store_id` va como STRING: los logs no tienen columna de tienda y el filtro
 * la lee del JSON, donde SQLite compara por tipo (`ActivityFeedService::logsBase`).
 */
final class GiftAudit
{
    /** Acciones de regalo: las únicas de `system_logs` que el filtro de tienda puede ubicar. */
    public const ACTIONS = ['sale.gift', 'sale.gift_cancelled'];

    public static function given(Sale $sale, SaleItem $item, SaleGift $gift, int $userId): void
    {
        $qty = (float) $gift->quantity;

        self::write('sale.gift', 'Regalo', $sale, $item, $gift, $qty, $userId);
    }

    public static function cancelled(Sale $sale, SaleItem $item, SaleGift $gift, float $qty, int $userId): void
    {
        self::write('sale.gift_cancelled', 'Regalo cancelado', $sale, $item, $gift, $qty, $userId);
    }

    private static function write(string $action, string $label, Sale $sale, SaleItem $item, SaleGift $gift, float $qty, int $userId): void
    {
        $listPrice = (float) $gift->list_price;
        $unitCost  = $gift->unit_cost !== null ? (float) $gift->unit_cost : null;
        $name      = $item->product_name ?? "#{$item->product_id}";

        SystemLog::write(
            $action,
            sprintf('%s: %s × %s — valía $%s (venta #%d)', $label, self::qty($qty), $name, number_format($qty * $listPrice, 2), $sale->id),
            $userId,
            'product',
            $item->product_id,
            [
                'sale_id'      => $sale->id,
                'sale_item_id' => $item->id,
                'store_id'     => (string) $sale->store_id,
                'name'         => $name,
                'sku'          => $item->product_sku,
                'quantity'     => $qty,
                'list_price'   => $listPrice,
                'value'        => round($qty * $listPrice, 2),
                'unit_cost'    => $unitCost,
                'cost_value'   => $unitCost !== null ? round($qty * $unitCost, 2) : null,
                'note'         => $gift->note,
            ],
        );
    }

    private static function qty(float $qty): string
    {
        return rtrim(rtrim(number_format($qty, 2, '.', ''), '0'), '.');
    }
}
