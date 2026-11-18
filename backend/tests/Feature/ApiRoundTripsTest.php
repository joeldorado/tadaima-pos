<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\CashRegister;
use App\Models\Company;
use App\Models\Inventory;
use App\Models\PaymentMethod;
use App\Models\Product;
use App\Models\Store;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Cache\RateLimiter;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PDO;
use Tests\TestCase;

/**
 * Viajes a la base por petición (2026-11-17). En prod cada venta tardaba más de
 * 2 s porque el tiempo se va en idas y vueltas a Supabase, en serie:
 *  - cada consulta eran 3 viajes (sentencia preparada en el servidor);
 *  - el `throttle` del grupo autenticado contaba en la caché de la base.
 * Estas pruebas fijan los dos arreglos y ponen techo a las consultas de una venta.
 */
class ApiRoundTripsTest extends TestCase
{
    use RefreshDatabase;

    /**
     * Consultas de `POST /sales` con 1 producto en efectivo: hoy 32 (sin contar
     * Sanctum, que aquí no corre). El techo deja margen para un cambio chico;
     * pasarlo es una decisión, no un descuido: cada consulta es un viaje.
     */
    private const SALE_QUERY_CEILING = 40;

    private function makeCashier(): array
    {
        $company = Company::create(['name' => 'Tadaima Test']);
        $store = Store::create(['company_id' => $company->id, 'name' => 'Tienda Centro', 'active' => true]);
        $warehouse = Warehouse::create([
            'company_id' => $company->id, 'store_id' => $store->id,
            'name' => 'Exhibición', 'type' => 'store', 'active' => true,
        ]);
        $register = CashRegister::create(['store_id' => $store->id, 'name' => 'Caja 1', 'active' => true]);
        $cash = PaymentMethod::create(['name' => 'Efectivo', 'allow_cash' => true, 'allow_card' => false, 'active' => true]);

        $user = User::create([
            'name' => 'Cajero', 'email' => 'cajero@test.com', 'password' => bcrypt('x'),
            'company_id' => $company->id, 'store_id' => $store->id, 'active' => true,
        ]);
        $roleId = DB::table('roles')->insertGetId([
            'name' => 'cajero', 'guard_name' => 'api', 'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('model_has_roles')->insert([
            'role_id' => $roleId, 'model_type' => User::class, 'model_id' => $user->id,
        ]);

        $product = Product::create([
            'company_id' => $company->id, 'name' => 'Booster', 'sku' => 'SKU-1',
            'cost' => 80, 'active' => true, 'product_type' => Product::TYPE_PRODUCT,
        ]);
        $product->price()->create(['price_1' => 150]);
        Inventory::create(['product_id' => $product->id, 'warehouse_id' => $warehouse->id, 'quantity' => 10]);

        return [$user, $store, $register, $cash, $product];
    }

    public function test_la_conexion_a_postgres_hace_un_viaje_por_consulta(): void
    {
        if (! extension_loaded('pdo_pgsql')) {
            $this->markTestSkipped('pdo_pgsql no está instalado en este entorno.');
        }

        $options = config('database.connections.pgsql.options');
        $this->assertTrue(
            $options[PDO::PGSQL_ATTR_DISABLE_PREPARES] ?? false,
            'Sin PGSQL_ATTR_DISABLE_PREPARES cada consulta son 3 viajes a Supabase (preparar, ejecutar, liberar).'
        );

        // En la suite de Postgres (phpunit.pgsql.xml) se comprueba que la opción
        // de verdad llega a PDO, no solo que está en el arreglo de config.
        if (DB::connection()->getDriverName() === 'pgsql') {
            $this->assertTrue((bool) DB::connection()->getPdo()->getAttribute(PDO::PGSQL_ATTR_DISABLE_PREPARES));
        }
    }

    public function test_el_throttle_del_grupo_autenticado_no_consulta_la_base(): void
    {
        [$user] = $this->makeCashier();
        // Como en producción: la caché general vive en la base. El contador del
        // throttle autenticado va a su propio store (aquí `array`, en prod `file`).
        config(['cache.default' => 'database', 'cache.api_throttle_store' => 'array']);
        // El limitador global se arma al arrancar la app (en tests, con `array`):
        // se rehace sobre la base para que un `throttle:120,1` a secas SÍ la toque
        // y esta prueba falle si alguien lo regresa.
        $this->app->forgetInstance(RateLimiter::class);
        $this->app->singleton(RateLimiter::class, fn ($app) => new RateLimiter($app->make('cache')->driver('database')));

        $cacheQueries = [];
        DB::listen(function ($query) use (&$cacheQueries): void {
            if (preg_match('/\b(from|into|update)\s+"?cache(_locks)?"?\b/i', $query->sql)) {
                $cacheQueries[] = $query->sql;
            }
        });

        $response = $this->actingAs($user)->getJson('/api/v1/cash/session')->assertOk();

        // El límite sigue activo…
        $response->assertHeader('X-RateLimit-Limit', '120');
        // …pero contar ya no cuesta viajes a la base.
        $this->assertSame([], $cacheQueries, 'El throttle del grupo autenticado volvió a contar en la tabla `cache`.');
    }

    public function test_los_limites_de_login_siguen_en_el_store_compartido(): void
    {
        // `throttle:pos-login` y los `us-*` arman su llave con correo e IP (datos
        // del visitante): tienen que contar igual en todas las instancias. Por eso
        // NO se define `cache.limiter` (el limitador global sigue en el store por
        // defecto) y solo el grupo autenticado usa su store aparte.
        $this->assertNull(config('cache.limiter'));
        $this->assertArrayHasKey('api_throttle_store', config('cache'));
    }

    public function test_una_venta_de_un_producto_no_pasa_del_techo_de_consultas(): void
    {
        [$user, $store, $register, $cash, $product] = $this->makeCashier();
        $this->actingAs($user)
            ->postJson('/api/v1/cash/open', ['register_id' => $register->id, 'opening_cash' => 0])
            ->assertCreated();
        $sessionId = (int) DB::table('cash_register_sessions')->where('user_id', $user->id)->value('id');

        $queries = [];
        DB::listen(function ($query) use (&$queries): void {
            $queries[] = $query->sql;
        });

        $this->actingAs($user)->postJson('/api/v1/sales', [
            'calc_version' => 2,
            'store_id' => $store->id,
            'register_session_id' => $sessionId,
            'items' => [['product_id' => $product->id, 'quantity' => 1, 'price' => 150]],
            'payments' => [['payment_method_id' => $cash->id, 'amount' => 150]],
        ])->assertCreated();

        $this->assertLessThanOrEqual(
            self::SALE_QUERY_CEILING,
            count($queries),
            'Una venta de 1 producto hizo ' . count($queries) . " consultas. Cada una es un viaje a Supabase:\n" . implode("\n", $queries)
        );
    }
}
