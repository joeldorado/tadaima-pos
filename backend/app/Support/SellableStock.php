<?php

declare(strict_types=1);

namespace App\Support;

use Illuminate\Support\Facades\DB;

/**
 * Criterio único de "stock vendible": SUM(inventory.quantity) > 0 en alguna
 * bodega de tienda (warehouses.type = 'store', i.e. Exhibición).
 *
 * Extraído de CatalogController::sellableStockExists (Catálogo v2) para que
 * el catálogo público MX, el panel del admin y la tienda US (TadaimaUS) nunca
 * discrepen sobre qué se considera "disponible".
 */
final class SellableStock
{
    /**
     * Closure para usar con ->whereExists() en una query correlacionada.
     *
     * @param string $productIdColumn Columna calificada contra la que se
     *                                correlaciona inventory.product_id
     *                                (ej. 'products.id', 'us_listings.product_id').
     */
    public static function existsClosure(string $productIdColumn = 'products.id'): \Closure
    {
        return function ($q) use ($productIdColumn) {
            $q->selectRaw('1')
                ->from('inventory')
                ->join('warehouses', 'warehouses.id', '=', 'inventory.warehouse_id')
                ->whereColumn('inventory.product_id', $productIdColumn)
                ->where('warehouses.type', 'store')
                ->groupBy('inventory.product_id')
                ->havingRaw('SUM(inventory.quantity) > 0');
        };
    }

    /**
     * De un set de product ids, cuáles tienen stock vendible.
     * Devuelve un mapa product_id => true para lookup directo. 1 query.
     *
     * @param  array<int, int> $productIds
     * @return array<int, true>
     */
    public static function inStockMap(array $productIds): array
    {
        if (empty($productIds)) {
            return [];
        }

        return DB::table('inventory')
            ->join('warehouses', 'warehouses.id', '=', 'inventory.warehouse_id')
            ->whereIn('inventory.product_id', $productIds)
            ->where('warehouses.type', 'store')
            ->groupBy('inventory.product_id')
            ->havingRaw('SUM(inventory.quantity) > 0')
            ->pluck('inventory.product_id')
            ->flip()
            ->map(fn () => true)
            ->all();
    }
}
