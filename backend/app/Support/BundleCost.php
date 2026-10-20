<?php

declare(strict_types=1);

namespace App\Support;

use App\Models\Product;
use Illuminate\Database\ConnectionInterface;
use Illuminate\Support\Facades\DB;

/**
 * Costo de un paquete — UN solo lugar para la fórmula (2026-10-14):
 * `Σ(costo de la pieza × qty)`; null si alguna pieza no tiene costo (así sale
 * en "Productos sin costo" en vez de inventar un número).
 *
 * BundleService lo usa al crear, editar, armar y desarmar. `syncForComponents`
 * lo aplica cuando cambia el costo de una PIEZA: antes el paquete se quedaba
 * con el costo viejo hasta el siguiente armado, y ese costo viejo era el que
 * se congelaba en `sale_items.cost` al venderlo. Lo llaman el PUT de productos
 * y de tomos, tadaima:homologar-costo-tomos y tadaima:import-macro; quien
 * escriba `products.cost` por query builder tiene que llamarlo también.
 */
final class BundleCost
{
    private const CHUNK = 500;

    /**
     * @param  iterable<array{cost: mixed, quantity: mixed}>  $lines  una por pieza
     */
    public static function compute(iterable $lines): ?float
    {
        $sum = 0.0;
        $any = false;
        foreach ($lines as $line) {
            $cost = $line['cost'];
            if ($cost === null || (float) $cost <= 0) {
                return null;
            }
            $sum += (float) $cost * (int) $line['quantity'];
            $any = true;
        }

        return $any ? round($sum, 2) : null;
    }

    /**
     * Recalcula `products.cost` de los paquetes que llevan alguna de esas piezas
     * y escribe solo los que cambiaron. Va por query builder sobre la conexión
     * recibida: los comandos de import escriben en `pgsql_target`, no en la
     * conexión default.
     *
     * @param  array<int|string>  $componentIds
     * @return array<int, array{old: ?float, new: ?float}>  paquetes cuyo costo cambió
     */
    public static function syncForComponents(array $componentIds, ?ConnectionInterface $db = null): array
    {
        $db ??= DB::connection();
        $ids = array_values(array_unique(array_map('intval', $componentIds)));
        if ($ids === []) {
            return [];
        }

        $bundleIds = [];
        foreach (array_chunk($ids, self::CHUNK) as $chunk) {
            foreach ($db->table('product_bundle_items')->whereIn('component_product_id', $chunk)->distinct()->pluck('bundle_product_id') as $id) {
                $bundleIds[(int) $id] = true;
            }
        }
        if ($bundleIds === []) {
            return [];
        }
        $bundleIds = array_keys($bundleIds);

        $changed = [];
        foreach (array_chunk($bundleIds, self::CHUNK) as $chunk) {
            $lines = $db->table('product_bundle_items as i')
                ->join('products as c', 'c.id', '=', 'i.component_product_id')
                ->whereIn('i.bundle_product_id', $chunk)
                ->get(['i.bundle_product_id', 'i.quantity', 'c.cost'])
                ->groupBy('bundle_product_id');
            $current = $db->table('products')
                ->whereIn('id', $chunk)
                ->where('product_type', Product::TYPE_BUNDLE)
                ->pluck('cost', 'id');

            foreach ($current as $bundleId => $cost) {
                $new = self::compute(($lines->get($bundleId) ?? collect())
                    ->map(fn (object $l) => ['cost' => $l->cost, 'quantity' => $l->quantity]));
                $old = $cost !== null ? round((float) $cost, 2) : null;
                if ($old === $new) {
                    continue;
                }
                $db->table('products')->where('id', $bundleId)->update(['cost' => $new, 'updated_at' => now()]);
                $changed[(int) $bundleId] = ['old' => $old, 'new' => $new];
            }
        }

        return $changed;
    }
}
