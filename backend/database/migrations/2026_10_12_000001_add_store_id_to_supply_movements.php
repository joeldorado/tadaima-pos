<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Tienda del MOVIMIENTO de insumo (2026-10-12, Joel), no solo de la categoría.
 *
 * Hasta ahora `supplies.store_id` (migración 2026-07-17) decide la tienda de
 * TODA la categoría ("Sueldos", "Compra de Cambio"…) de una vez. Si esa
 * categoría se creó como "toda la empresa" (store_id NULL, normalmente por un
 * admin), CUALQUIER cajero que registre una compra contra ella queda atado a
 * "toda la empresa" sin importar en qué tienda esté — y su reporte por tienda
 * nunca la encuentra.
 *
 * Esta columna es NULLABLE y SIN backfill a propósito: no nos interesa
 * "arreglar" los movimientos ya registrados (Joel 2026-10-12), solo que los
 * NUEVOS queden atados a la tienda del usuario que los registra, sin importar
 * la tienda de la categoría. `SuppliesController::movements()` usa
 * COALESCE(supply_movements.store_id, supplies.store_id) al filtrar: los
 * movimientos viejos (NULL aquí) se siguen resolviendo exactamente como antes,
 * por la tienda de la categoría.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('supply_movements', 'store_id')) {
            return;
        }

        Schema::table('supply_movements', function (Blueprint $table) {
            $table->foreignId('store_id')->nullable()->after('supply_id')
                ->constrained('stores')->nullOnDelete();
            $table->index(['store_id', 'created_at']);
        });
    }

    public function down(): void
    {
        if (! Schema::hasColumn('supply_movements', 'store_id')) {
            return;
        }

        Schema::table('supply_movements', function (Blueprint $table) {
            $table->dropConstrainedForeignId('store_id');
        });
    }
};
