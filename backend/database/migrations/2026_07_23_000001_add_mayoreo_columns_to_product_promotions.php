<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Mayoreo (2026-07-23) — el tipo `qty_discount` cambia de significado.
 *
 * ANTES (tiers): "−$100 por cada grupo de 2". Las piezas que no completaban
 * grupo no recibían nada; 5 pzas con {qty:2,amount:100} daban −$200.
 * AHORA (min_qty + discount_per_unit): "desde 2 piezas, −$50 a CADA UNA".
 * 5 pzas dan −$250. Es el mayoreo que pidió Joel.
 *
 * `tiers` NO se dropea a propósito: es lo que hace real el rollback (bajar el
 * release anterior solo requiere dropear estas dos columnas) y es el único
 * rastro para reconfigurar a mano las promos multi-escalón que el backfill
 * pausa. La conversión de los datos vive en la migración gemela _000002.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('product_promotions', function (Blueprint $table) {
            if (!Schema::hasColumn('product_promotions', 'min_qty')) {
                $table->unsignedSmallInteger('min_qty')->nullable()->after('tiers');
            }
            if (!Schema::hasColumn('product_promotions', 'discount_per_unit')) {
                // decimal(10,2) como todo el dinero del sistema: la etiqueta que
                // se anuncia y el monto que se cobra tienen que ser el mismo
                // número (con más decimales se anunciaría $33.33 y se cobraría
                // 33.3333/pieza).
                $table->decimal('discount_per_unit', 10, 2)->nullable()->after('min_qty');
            }
        });
    }

    public function down(): void
    {
        Schema::table('product_promotions', function (Blueprint $table) {
            foreach (['discount_per_unit', 'min_qty'] as $col) {
                if (Schema::hasColumn('product_promotions', $col)) {
                    $table->dropColumn($col);
                }
            }
        });
    }
};
