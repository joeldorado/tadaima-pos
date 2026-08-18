<?php

declare(strict_types=1);

namespace App\Support;

use Illuminate\Database\ConnectionInterface;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Facades\DB;

/**
 * Reparación del pivote de categorías múltiples (2026-08-18).
 *
 * Por qué existe: mientras el servicio viejo (tadaima.poslite.com.mx, código
 * anterior a categorías múltiples) siga escribiendo contra la misma base,
 * crea/edita productos poniendo SOLO `products.category_id` — sin renglón en
 * `product_category_assignments`. Para el POS nuevo (pivote = verdad) esos
 * productos salen "Sin categoría" aunque el viejo les puso una.
 *
 * Regla: producto con `category_id` y SIN ningún renglón en el pivote → se le
 * inserta ese `category_id` como su única categoría (position 0). Nunca toca
 * productos que ya tienen pivote (ahí el pivote manda). Idempotente: correrlo
 * N veces da lo mismo. Lo usan la migración 2026_08_18_000004 (auto en cada
 * deploy) y el comando `tadaima:reparar-categorias` (a mano, sin deploy).
 */
final class CategoryPivotRepair
{
    /**
     * @param  string|null  $connection  Conexión Laravel (null = default).
     * @return int Productos reparados.
     */
    public static function run(?string $connection = null): int
    {
        $db = DB::connection($connection);
        if (! $db->getSchemaBuilder()->hasTable('product_category_assignments')) {
            return 0;
        }

        $repaired = 0;
        self::pendingQuery($db)
            ->orderBy('id')
            ->chunkById(500, function ($products) use (&$repaired, $db) {
                $now = now();
                $rows = $products->map(fn ($p) => [
                    'product_id' => $p->id,
                    'category_id' => $p->category_id,
                    'position' => 0,
                    'created_at' => $now,
                    'updated_at' => $now,
                ])->all();

                $repaired += $db->table('product_category_assignments')->insertOrIgnore($rows);
            });

        return $repaired;
    }

    /** Cuántos productos están hoy en ese estado (diagnóstico, no escribe). */
    public static function pendingCount(?string $connection = null): int
    {
        $db = DB::connection($connection);
        if (! $db->getSchemaBuilder()->hasTable('product_category_assignments')) {
            return 0;
        }

        return self::pendingQuery($db)->count();
    }

    private static function pendingQuery(ConnectionInterface $db): Builder
    {
        return $db->table('products')
            ->whereNotNull('category_id')
            ->whereNotExists(fn ($q) => $q
                ->selectRaw('1')
                ->from('product_category_assignments as pca')
                ->whereColumn('pca.product_id', 'products.id'));
    }
}
