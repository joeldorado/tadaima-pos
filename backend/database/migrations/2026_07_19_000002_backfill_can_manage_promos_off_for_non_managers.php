<?php

declare(strict_types=1);

use App\Models\User;
use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Backfill (pedido Joel 2026-07-18): el default TRUE de can_manage_promos
 * (migración 2026_07_19_000001) dejó a TODOS los usuarios en ON — pero solo
 * los gerentes deben nacer con el permiso. Apagar el flag a quien NO tenga
 * rol gerente/manager ni admin (cajeros, usuarios sin rol). El rol ya los
 * bloqueaba en el gate; esto alinea el DATO para la UI de Permisos y para
 * futuras promociones de rol. Idempotente.
 */
return new class extends Migration
{
    public function up(): void
    {
        $grantedRoles = array_merge(['gerente', 'manager'], User::ADMIN_ROLES);

        $grantedUserIds = DB::table('model_has_roles')
            ->join('roles', 'roles.id', '=', 'model_has_roles.role_id')
            ->where('model_has_roles.model_type', User::class)
            ->whereIn('roles.name', $grantedRoles)
            ->pluck('model_has_roles.model_id');

        DB::table('users')
            ->whereNotIn('id', $grantedUserIds)
            ->update(['can_manage_promos' => false]);
    }

    public function down(): void
    {
        // Sin reversa: el estado anterior (todos en true) era el bug.
    }
};
