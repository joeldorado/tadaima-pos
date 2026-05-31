<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

/**
 * Seed mínimo para arrancar PROD desde cero en fase de pruebas (2026-05-30).
 *
 * Deja únicamente:
 *  - 1 empresa (Tadaima)
 *  - 3 roles: admin, gerente, cajero
 *  - métodos de pago base: Efectivo, Tarjeta Débito, Tarjeta Crédito, Transferencia
 *  - 1 usuario admin "Pier" (store_id null, can_view_cost = true)
 *
 * NO crea tiendas, productos, inventario, cajas, terminales, clientes ni ventas.
 * El usuario los crea manualmente desde la UI.
 *
 * Credenciales de Pier vía env (con defaults):
 *   PIER_NAME (default "Pier"), PIER_EMAIL (default pier@tadaima.mx),
 *   PIER_PASSWORD (default "Tadaima2026").
 */
class PierFreshSeeder extends Seeder
{
    public function run(): void
    {
        $now = now();

        $companyId = DB::table('companies')->insertGetId([
            'name'       => 'Tadaima',
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        $roleIds = [];
        foreach (['admin', 'gerente', 'cajero'] as $name) {
            $roleIds[$name] = DB::table('roles')->insertGetId([
                'name'       => $name,
                'guard_name' => 'api',
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }

        foreach (['Efectivo', 'Tarjeta Débito', 'Tarjeta Crédito', 'Transferencia'] as $pm) {
            DB::table('payment_methods')->insert([
                'name'       => $pm,
                'active'     => true,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }

        $name     = env('PIER_NAME', 'Pier');
        $email    = env('PIER_EMAIL', 'pier@tadaima.mx');
        $password = env('PIER_PASSWORD', 'Tadaima2026');

        $adminId = DB::table('users')->insertGetId([
            'company_id'    => $companyId,
            'store_id'      => null,
            'name'          => $name,
            'email'         => $email,
            'password'      => Hash::make($password),
            'active'        => true,
            'can_view_cost' => true,
            'created_at'    => $now,
            'updated_at'    => $now,
        ]);

        DB::table('model_has_roles')->insert([
            'role_id'    => $roleIds['admin'],
            'model_type' => 'App\\Models\\User',
            'model_id'   => $adminId,
        ]);

        $this->command?->info("PierFreshSeeder: admin '{$name}' <{$email}> creado. Sin tiendas/productos.");
    }
}
