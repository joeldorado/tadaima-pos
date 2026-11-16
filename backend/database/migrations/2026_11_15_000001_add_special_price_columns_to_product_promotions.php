<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Precio especial (2026-11-15, tickets T-001/T-002) — tipo `special_price`.
 *
 * Aplica desde 1 pieza, a cada pieza de la línea:
 *  - price_mode = 'fixed'   → special_value = precio final por pieza ($350).
 *  - price_mode = 'percent' → special_value = % de descuento (1–99, Buen Fin 45%).
 *
 * Aditiva e idempotente: las filas existentes (nxm / qty_discount) quedan con
 * ambas columnas en NULL y el motor no las lee. Rollback = bajar el release y
 * dropear estas dos columnas.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('product_promotions', function (Blueprint $table) {
            if (! Schema::hasColumn('product_promotions', 'price_mode')) {
                $table->string('price_mode', 10)->nullable();
            }
            if (! Schema::hasColumn('product_promotions', 'special_value')) {
                // decimal(10,2) como todo el dinero del sistema: la etiqueta y
                // el monto cobrado son el mismo número.
                $table->decimal('special_value', 10, 2)->nullable();
            }
        });
    }

    public function down(): void
    {
        Schema::table('product_promotions', function (Blueprint $table) {
            foreach (['special_value', 'price_mode'] as $col) {
                if (Schema::hasColumn('product_promotions', $col)) {
                    $table->dropColumn($col);
                }
            }
        });
    }
};
