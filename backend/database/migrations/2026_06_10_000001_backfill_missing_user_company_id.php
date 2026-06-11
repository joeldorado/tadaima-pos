<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Backfill: los usuarios dados de alta por UI nacían con `company_id = NULL`
 * (el frontend no manda company_id y `UserController::store` no lo derivaba).
 * Con company NULL el usuario no puede crear tiendas/bodegas (422) y ve/escribe
 * settings de una "company fantasma". Bug QA 2026-06-10.
 *
 * Estrategia: derivar de la company de su tienda asignada; si no tiene tienda
 * y existe UNA sola company, usar esa. Idempotente: solo toca company_id NULL.
 */
return new class extends Migration
{
    public function up(): void
    {
        // 1) Usuarios con tienda → company de la tienda
        $usersConTienda = DB::table('users')
            ->join('stores', 'stores.id', '=', 'users.store_id')
            ->whereNull('users.company_id')
            ->whereNotNull('stores.company_id')
            ->get(['users.id', 'stores.company_id']);

        foreach ($usersConTienda as $u) {
            DB::table('users')->where('id', $u->id)->update(['company_id' => $u->company_id]);
        }

        // 2) Usuarios sin tienda → solo si hay exactamente una company
        $companies = DB::table('companies')->pluck('id');

        if ($companies->count() === 1) {
            DB::table('users')
                ->whereNull('company_id')
                ->update(['company_id' => $companies->first()]);
        }
    }

    public function down(): void
    {
        // No-op: no podemos distinguir los company_id backfilleados de los
        // asignados manualmente después.
    }
};
