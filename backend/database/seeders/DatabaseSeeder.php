<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;

/**
 * Seed mínimo para deploy / pruebas.
 *
 * Incluye:
 *  - 1 empresa (Tadaima)
 *  - 3 roles: admin, gerente, cajero
 *  - 4 métodos de pago: Efectivo, Tarjeta Débito, Tarjeta Crédito, Transferencia
 *  - 2 tiendas: Tienda 1 (Centro), Tienda 2 (Macroplaza)
 *  - 3 usuarios: admin, gerente-1, gerente-2
 *  - 1 caja registradora por tienda
 *  - 1 terminal TPV por tienda (3.5 % comisión)
 *  - 1 configuración del sistema
 *
 * NO incluye: productos, categorías, proveedores, clientes,
 *             catálogos de preventa, ventas ni inventario.
 */
class DatabaseSeeder extends Seeder
{
    public function run(): void
    {
        $now = now();

        // ── 1. Empresa ────────────────────────────────────────────────────────
        $companyId = DB::table('companies')->insertGetId([
            'name'       => 'Tadaima',
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        // ── 2. Roles ──────────────────────────────────────────────────────────
        $roleIds = [];
        foreach (['admin', 'gerente', 'cajero'] as $name) {
            $roleIds[$name] = DB::table('roles')->insertGetId([
                'name'       => $name,
                'guard_name' => 'api',
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }

        // ── 3. Métodos de pago ────────────────────────────────────────────────
        $pmIds = [];
        foreach (['Efectivo', 'Tarjeta Débito', 'Tarjeta Crédito', 'Transferencia'] as $pm) {
            $pmIds[$pm] = DB::table('payment_methods')->insertGetId([
                'name'       => $pm,
                'active'     => true,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }

        // ── 4. Tiendas (manager_id se actualiza después) ──────────────────────
        $storeCentroId = DB::table('stores')->insertGetId([
            'company_id' => $companyId,
            'name'       => 'Tienda 1 — Centro',
            'address'    => 'Centro',
            'active'     => true,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        $storeMacroId = DB::table('stores')->insertGetId([
            'company_id' => $companyId,
            'name'       => 'Tienda 2 — Macroplaza',
            'address'    => 'Macroplaza',
            'active'     => true,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        // ── 5. Usuarios ───────────────────────────────────────────────────────
        $adminId = DB::table('users')->insertGetId([
            'company_id'    => $companyId,
            'store_id'      => null,
            'name'          => 'Admin',
            'email'         => 'admin@tadaima.mx',
            'password'      => Hash::make('devaccess'),
            'active'        => true,
            'can_view_cost' => true,
            'created_at'    => $now,
            'updated_at'    => $now,
        ]);

        $gerente1Id = DB::table('users')->insertGetId([
            'company_id'    => $companyId,
            'store_id'      => $storeCentroId,
            'name'          => 'Gerente Tienda 1',
            'email'         => 'gerente1@tadaima.mx',
            'password'      => Hash::make('devaccess'),
            'active'        => true,
            'can_view_cost' => true,
            'created_at'    => $now,
            'updated_at'    => $now,
        ]);

        $gerente2Id = DB::table('users')->insertGetId([
            'company_id'    => $companyId,
            'store_id'      => $storeMacroId,
            'name'          => 'Gerente Tienda 2',
            'email'         => 'gerente2@tadaima.mx',
            'password'      => Hash::make('devaccess'),
            'active'        => true,
            'can_view_cost' => true,
            'created_at'    => $now,
            'updated_at'    => $now,
        ]);

        // ── 6. Asignar manager_id a las tiendas ───────────────────────────────
        DB::table('stores')->where('id', $storeCentroId)->update(['manager_id' => $gerente1Id, 'updated_at' => $now]);
        DB::table('stores')->where('id', $storeMacroId)->update(['manager_id' => $gerente2Id,  'updated_at' => $now]);

        // ── 7. Roles ──────────────────────────────────────────────────────────
        $modelType = 'App\Models\User';
        DB::table('model_has_roles')->insert([
            ['role_id' => $roleIds['admin'],   'model_type' => $modelType, 'model_id' => $adminId],
            ['role_id' => $roleIds['gerente'],  'model_type' => $modelType, 'model_id' => $gerente1Id],
            ['role_id' => $roleIds['gerente'],  'model_type' => $modelType, 'model_id' => $gerente2Id],
        ]);

        // ── 8. Cajas registradoras ────────────────────────────────────────────
        DB::table('cash_registers')->insert([
            ['store_id' => $storeCentroId, 'name' => 'Caja 1 — Tienda 1', 'active' => true, 'created_at' => $now, 'updated_at' => $now],
            ['store_id' => $storeMacroId,  'name' => 'Caja 1 — Tienda 2', 'active' => true, 'created_at' => $now, 'updated_at' => $now],
        ]);

        // ── 9. Terminales TPV (1 por tienda, 3.5 % comisión) ─────────────────
        DB::table('terminals')->insert([
            ['store_id' => $storeCentroId, 'name' => 'Terminal Tienda 1', 'commission_percent' => 3.5, 'active' => true, 'created_at' => $now, 'updated_at' => $now],
            ['store_id' => $storeMacroId,  'name' => 'Terminal Tienda 2', 'commission_percent' => 3.5, 'active' => true, 'created_at' => $now, 'updated_at' => $now],
        ]);

        // ── 10. Métodos de pago por tienda ────────────────────────────────────
        $rows = [];
        foreach ([$storeCentroId, $storeMacroId] as $sid) {
            foreach ($pmIds as $pmId) {
                $rows[] = ['store_id' => $sid, 'payment_method_id' => $pmId, 'active' => true, 'created_at' => $now, 'updated_at' => $now];
            }
        }
        DB::table('store_payment_methods')->insert($rows);

        // ── 11. Configuración del sistema ─────────────────────────────────────
        DB::table('system_settings')->insert([
            ['company_id' => $companyId, 'key' => 'points_multiplier', 'value' => '0.001'],
        ]);
    }
}
