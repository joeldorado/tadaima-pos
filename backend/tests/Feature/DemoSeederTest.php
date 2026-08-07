<?php

namespace Tests\Feature;

use Database\Seeders\DemoSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * DemoSeeder (pipeline de screenshots de docs):
 *  - idempotente: 2 corridas = mismos conteos
 *  - credenciales e2e válidas (login real por HTTP)
 *  - guard: no siembra nada en producción
 */
class DemoSeederTest extends TestCase
{
    use RefreshDatabase;

    private const TABLES = [
        'companies', 'roles', 'payment_methods', 'stores', 'warehouses',
        'cash_registers', 'terminals', 'store_payment_methods', 'users',
        'model_has_roles', 'product_categories', 'suppliers', 'products',
        'product_prices', 'inventory', 'product_promotions',
        'product_promotion_assignments', 'customers', 'pre_sale_catalogs',
        'pre_sale_catalog_store_limits', 'pre_sale_orders',
        'pre_sale_order_items', 'payments', 'cash_register_sessions',
        'sales', 'sale_items',
    ];

    /** @return array<string, int> */
    private function counts(): array
    {
        $counts = [];
        foreach (self::TABLES as $table) {
            $counts[$table] = DB::table($table)->count();
        }

        return $counts;
    }

    public function test_seeder_es_idempotente_dos_corridas_mismos_conteos(): void
    {
        $this->seed(DemoSeeder::class);
        $first = $this->counts();

        $this->seed(DemoSeeder::class);
        $second = $this->counts();

        $this->assertSame($first, $second, 'Segunda corrida cambió conteos: '.json_encode(array_diff_assoc($second, $first)));

        // Sanity de los datos ricos.
        // 20 con costo + 2 sin costo (alimentan el modal "Productos sin Costo").
        $this->assertSame(22, DB::table('products')->count());
        $this->assertSame(3, DB::table('product_promotions')->count());
        $this->assertSame(3, DB::table('customers')->count());
        $this->assertSame(1, DB::table('pre_sale_catalogs')->count());
        $this->assertSame(2, DB::table('pre_sale_orders')->count());
        $this->assertSame(5, DB::table('sales')->count());
        $this->assertSame(1, DB::table('cash_register_sessions')->where('status', 'closed')->count());
    }

    public function test_credenciales_e2e_hacen_login(): void
    {
        $this->seed(DemoSeeder::class);

        $creds = [
            ['admin@tadaima.mx', 'password', 'admin'],
            ['cajero@test.com', 'password123', 'cajero'],
            ['gerente@test.com', 'password123', 'gerente'],
        ];

        foreach ($creds as [$email, $password, $role]) {
            $res = $this->postJson('/api/v1/auth/login', [
                'email' => $email, 'password' => $password,
            ]);
            $res->assertOk();
            $this->assertNotEmpty($res->json('data.token'), "Sin token para {$email}");

            $userId = DB::table('users')->where('email', $email)->value('id');
            $roleName = DB::table('model_has_roles')
                ->join('roles', 'roles.id', '=', 'model_has_roles.role_id')
                ->where('model_has_roles.model_id', $userId)
                ->where('model_has_roles.model_type', 'App\Models\User')
                ->value('roles.name');
            $this->assertSame($role, $roleName, "Rol equivocado para {$email}");
        }
    }

    public function test_ventas_historicas_cuadran_con_el_corte(): void
    {
        $this->seed(DemoSeeder::class);

        // Invariante: total = subtotal − discount en todas las ventas demo.
        $broken = DB::table('sales')
            ->whereRaw('ROUND(subtotal - discount, 2) != ROUND(total, 2)')
            ->count();
        $this->assertSame(0, $broken);

        // Cada venta tiene su pago por el total.
        $sales = DB::table('sales')->get();
        foreach ($sales as $sale) {
            $paid = (float) DB::table('payments')->where('sale_id', $sale->id)->sum('amount');
            $this->assertEqualsWithDelta((float) $sale->total, $paid, 0.01);
        }

        // closing_cash = apertura + ventas en Efectivo del corte.
        $session = DB::table('cash_register_sessions')->where('status', 'closed')->first();
        $this->assertNotNull($session);
        $cashMethodId = DB::table('payment_methods')->where('name', 'Efectivo')->value('id');
        $cashSales = (float) DB::table('payments')
            ->join('sales', 'sales.id', '=', 'payments.sale_id')
            ->where('sales.register_session_id', $session->id)
            ->where('payments.payment_method_id', $cashMethodId)
            ->sum('payments.amount');
        $this->assertEqualsWithDelta(
            (float) $session->opening_cash + $cashSales,
            (float) $session->closing_cash,
            0.01,
        );
    }

    public function test_guard_no_siembra_en_produccion(): void
    {
        $this->app['env'] = 'production';

        try {
            // Directo (sin artisan db:seed, que en producción pide confirmación).
            (new DemoSeeder())->run();
        } finally {
            $this->app['env'] = 'testing';
        }

        $this->assertSame(0, DB::table('users')->count());
        $this->assertSame(0, DB::table('products')->count());
        $this->assertSame(0, DB::table('stores')->count());
    }
}
