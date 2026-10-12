<?php

declare(strict_types=1);

namespace App\Support;

/**
 * SQL correlacionado del stock TOTAL de `products.id` — UN solo lugar para los
 * listados que filtran y ordenan por stock (GET /products y GET /mangas).
 *
 * Misma semántica que `stock_total` de los resources y que los contadores de
 * GET /products/stats: con tienda = Exhibición + Bodega de esa tienda; sin
 * tienda = todo el inventario. Si dos listados calcularan el stock distinto,
 * el badge de "Agotados" volvería a no cuadrar con la tabla (2026-10-12).
 *
 * Portable (pgsql prod / sqlite tests). Con tienda lleva un `?`: úsalo siempre
 * junto con `bindings()`.
 */
final class StockSql
{
    public static function total(?int $storeId): string
    {
        return $storeId
            ? 'COALESCE((SELECT SUM(i.quantity) FROM inventory i JOIN warehouses w ON w.id = i.warehouse_id WHERE i.product_id = products.id AND w.store_id = ?), 0)'
            : 'COALESCE((SELECT SUM(i.quantity) FROM inventory i WHERE i.product_id = products.id), 0)';
    }

    /** @return list<int> */
    public static function bindings(?int $storeId): array
    {
        return $storeId ? [$storeId] : [];
    }
}
