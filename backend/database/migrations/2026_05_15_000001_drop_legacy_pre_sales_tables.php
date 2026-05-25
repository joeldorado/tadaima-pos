<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Borra las tablas del esquema legacy de preventas (single-table) ahora que
 * todo el sistema corre contra el esquema nuevo (pre_sale_catalogs +
 * pre_sale_orders + pre_sale_order_items + pre_sale_order_payments +
 * pre_sale_order_logs).
 *
 * Orden de drop por dependencias FK:
 *   1. pre_sale_logs       → FK pre_sale_id
 *   2. pre_sale_payments   → FK pre_sale_id
 *   3. pre_sale_items      → FK pre_sale_id
 *   4. pre_sales           → tabla raíz
 *
 * No es reversible: el `down()` queda intencionalmente vacío porque el
 * esquema fuente no debe re-crearse (decisión Joel 2026-05-15).
 */
return new class extends Migration {
    public function up(): void
    {
        // En SQLite (tests con :memory:), `dropIfExists` deja FK textuales
        // colgando — payments.pre_sale_id sigue apuntando a la tabla borrada
        // y al INSERT en payments dispara "no such table: pre_sales". Hay
        // que soltar la FK antes del drop. En MySQL prod usamos disable
        // global de constraints (los `dropForeign` de Laravel no resuelven
        // FKs creadas con `foreignId(...)->constrained()` anónimo siempre).
        if (DB::getDriverName() === 'mysql') {
            Schema::disableForeignKeyConstraints();
        } else {
            // SQLite + otros — soltar la FK explícita declarada en migración 38.
            if (Schema::hasTable('payments') && Schema::hasColumn('payments', 'pre_sale_id')) {
                try {
                    Schema::table('payments', function ($table) {
                        $table->dropForeign(['pre_sale_id']);
                    });
                } catch (\Throwable $e) {
                    // Si la FK no existe (driver que no la creó), continuar.
                }
            }
        }

        Schema::dropIfExists('pre_sale_logs');
        Schema::dropIfExists('pre_sale_payments');
        Schema::dropIfExists('pre_sale_items');
        Schema::dropIfExists('pre_sales');

        if (DB::getDriverName() === 'mysql') {
            Schema::enableForeignKeyConstraints();
        }
    }

    public function down(): void
    {
        // Intencionalmente vacío — no se restaura el esquema legacy.
    }
};
