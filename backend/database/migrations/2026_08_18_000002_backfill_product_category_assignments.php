<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Backfill de categorías múltiples (2026-08-17): cada producto con
 * `category_id` recibe UNA asignación en el pivote — con una sola categoría el
 * POS se comporta exactamente igual que antes. Idempotente por el UNIQUE
 * (product_id, category_id) + insertOrIgnore. Data migration separada del
 * esquema, como manda la casa.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('product_category_assignments')) {
            return;
        }

        DB::table('products')
            ->whereNotNull('category_id')
            ->orderBy('id')
            ->chunkById(500, function ($products) {
                $now = now();
                $rows = $products->map(fn ($p) => [
                    'product_id' => $p->id,
                    'category_id' => $p->category_id,
                    'position' => 0,
                    'created_at' => $now,
                    'updated_at' => $now,
                ])->all();

                DB::table('product_category_assignments')->insertOrIgnore($rows);
            });
    }

    public function down(): void
    {
        // No-op: el pivote es la fuente de verdad nueva; category_id sigue ahí.
    }
};
