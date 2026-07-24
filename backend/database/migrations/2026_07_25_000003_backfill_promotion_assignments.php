<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Backfill de promos generales (2026-07-25): cada promo existente (que nació
 * atada a UN producto) se convierte en una promo general con UNA asignación.
 * Con un solo producto asignado el motor se comporta EXACTO igual que antes —
 * ese es el argumento de compatibilidad de toda la migración.
 *
 * Idempotente por el UNIQUE (promotion_id, product_id) + insertOrIgnore:
 * re-correrla no duplica ni truena (precedente: backfill_mayoreo_from_tiers).
 * Data migration separada del esquema, como manda la casa: si esto tronara
 * con datos raros, el esquema ya aterrizó.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('product_promotion_assignments')) {
            return;
        }

        DB::table('product_promotions')
            ->whereNotNull('product_id')
            ->orderBy('id')
            ->chunkById(200, function ($promos) {
                $now = now();
                $rows = $promos->map(fn ($p) => [
                    'promotion_id' => $p->id,
                    'product_id'   => $p->product_id,
                    'created_at'   => $now,
                    'updated_at'   => $now,
                ])->all();

                DB::table('product_promotion_assignments')->insertOrIgnore($rows);
            });
    }

    public function down(): void
    {
        // No-op: las asignaciones son la fuente de verdad nueva; borrarlas
        // dejaría promos huérfanas. El rastro legacy (product_id) sigue ahí.
    }
};
