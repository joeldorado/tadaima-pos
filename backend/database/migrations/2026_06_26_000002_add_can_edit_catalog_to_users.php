<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Permiso `users.can_edit_catalog`: habilita a un no-admin (gerente) a editar la
 * tienda online de su sucursal desde Configuración → Catálogo Online.
 *
 * Espejo de `can_view_cost`: admin siempre puede; el resto solo con el flag, que
 * el admin enciende explícitamente en Permisos. Default false (fail-closed).
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->boolean('can_edit_catalog')->default(false)->after('can_view_cost');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('can_edit_catalog');
        });
    }
};
