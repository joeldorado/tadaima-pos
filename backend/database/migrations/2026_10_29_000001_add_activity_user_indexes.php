<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Índices para el feed de Actividad (2026-10-29): el "historial de un
 * cajero" filtra `inventory_movements` y `system_logs` por `user_id` dentro
 * de un rango de fechas. Postgres NO indexa FKs automáticamente; sin esto el
 * filtro por usuario recorría la tabla completa. Aditiva e idempotente.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasIndex('inventory_movements', 'inventory_movements_user_created_index')) {
            Schema::table('inventory_movements', function (Blueprint $table) {
                $table->index(['user_id', 'created_at'], 'inventory_movements_user_created_index');
            });
        }

        if (! Schema::hasIndex('system_logs', 'system_logs_user_created_index')) {
            Schema::table('system_logs', function (Blueprint $table) {
                $table->index(['user_id', 'created_at'], 'system_logs_user_created_index');
            });
        }
    }

    public function down(): void
    {
        Schema::table('inventory_movements', function (Blueprint $table) {
            $table->dropIndex('inventory_movements_user_created_index');
        });

        Schema::table('system_logs', function (Blueprint $table) {
            $table->dropIndex('system_logs_user_created_index');
        });
    }
};
