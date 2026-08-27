<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Re-snap del costo a las partidas de preventa ABIERTAS (no entregadas).
 *
 * Los folios creados antes de esta regla congelaron cost = NULL porque la
 * mercancía todavía no se compraba. Este backfill los alinea con el costo que
 * hoy tiene su catálogo. Las partidas ENTREGADAS no se tocan: su costo ya es
 * historia cerrada.
 */
return new class extends Migration
{
    public function up(): void
    {
        // Un UPDATE ... JOIN no es portable entre MySQL (prod) y SQLite (tests),
        // así que se recorre catálogo por catálogo. El volumen es chico.
        DB::table('pre_sale_catalogs')
            ->where('cost', '>', 0)   // 0 cuenta como "sin costo": no vale rellenar
            ->select('id', 'cost')
            ->orderBy('id')
            ->chunk(200, function ($catalogs) {
                foreach ($catalogs as $catalog) {
                    DB::table('pre_sale_order_items')
                        ->where('pre_sale_catalog_id', $catalog->id)
                        ->where('status', '!=', 'delivered')
                        ->where(fn ($q) => $q->whereNull('cost')->orWhere('cost', '<=', 0))
                        ->update(['cost' => $catalog->cost]);
                }
            });
    }

    public function down(): void
    {
        // Irreversible por diseño: no sabemos cuáles eran NULL originalmente.
    }
};
