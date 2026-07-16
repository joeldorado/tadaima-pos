<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Permiso por usuario "Gestionar Promociones" (pedido Joel 2026-07-18).
 *
 * Default TRUE (modelo de REVOCACIÓN, a diferencia de can_view_cost/
 * can_edit_catalog que son de concesión): los gerentes siguen creando promos
 * tal como hoy sin que el admin active nada; el admin lo QUITA por usuario en
 * Permisos. El flag solo aplica a no-admins y el rol admin/gerente sigue
 * siendo requisito (un cajero con flag true sigue bloqueado por rol).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->boolean('can_manage_promos')->default(true)->after('can_edit_catalog');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('can_manage_promos');
        });
    }
};
