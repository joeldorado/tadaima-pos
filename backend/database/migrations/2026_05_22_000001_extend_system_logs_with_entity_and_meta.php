<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Extiende `system_logs` con `entity_type`, `entity_id`, `meta` para que sirva
 * como tabla de auditoría genérica. La columna `description` mantiene su rol
 * de resumen legible; `meta` guarda el diff estructurado cuando aplica.
 *
 * No se hace backfill ni se cambia `action` / `description` existentes.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('system_logs', function (Blueprint $table) {
            // Tipo de entidad afectada: 'product', 'manga', 'inventory', etc.
            // Nullable para no romper filas históricas (acciones del sistema sin entidad).
            $table->string('entity_type', 64)->nullable()->after('action');
            $table->unsignedBigInteger('entity_id')->nullable()->after('entity_type');
            // JSON con diff/payload (campos cambiados, before/after, etc.).
            // En MySQL prod soporta json nativo; en SQLite tests cae a text.
            $table->json('meta')->nullable()->after('description');

            // Permite búsquedas tipo "todos los cambios del producto N".
            $table->index(['entity_type', 'entity_id'], 'system_logs_entity_idx');
        });
    }

    public function down(): void
    {
        Schema::table('system_logs', function (Blueprint $table) {
            $table->dropIndex('system_logs_entity_idx');
            $table->dropColumn(['entity_type', 'entity_id', 'meta']);
        });
    }
};
