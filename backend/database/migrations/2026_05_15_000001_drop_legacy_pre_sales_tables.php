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
        // Apagar FK checks (MySQL) para evitar problemas con FKs sobrevivientes.
        if (DB::getDriverName() === 'mysql') {
            Schema::disableForeignKeyConstraints();
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
