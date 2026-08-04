<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Inventory;
use App\Models\Product;
use App\Models\ProductPromotion;
use App\Models\Store;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * GET /products/stats — contadores REALES del catálogo completo (2026-08-04).
 *
 * Con ~14k productos tras el import Macro, los chips de la página Productos
 * contaban solo la página cargada (~100). Este endpoint agrega por SQL:
 * total/agotados/por_agotarse/con_promo para cualquiera, y sin_costo/
 * valor_invertido SOLO con can_view_cost. Scope de tienda fail-closed
 * (gerente/cajero anclados a la suya, como en reportes).
 */
class ProductStatsTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;
    private Store $storeA;
    private Store $storeB;
    private Warehouse $exhibA;
    private Warehouse $bodegaA;
    private Warehouse $exhibB;
    private User $admin;
    private User $gerenteA;
    private User $gerenteSinTienda;

    protected function setUp(): void
    {
        parent::setUp();

        $this->company = Company::create(['name' => 'Tadaima Test']);

        $this->storeA = Store::create(['company_id' => $this->company->id, 'name' => 'Tienda A', 'active' => true]);
        $this->storeB = Store::create(['company_id' => $this->company->id, 'name' => 'Tienda B', 'active' => true]);

        $this->exhibA = Warehouse::create([
            'company_id' => $this->company->id, 'store_id' => $this->storeA->id,
            'name' => 'Exhibición A', 'type' => 'store', 'active' => true,
        ]);
        $this->bodegaA = Warehouse::create([
            'company_id' => $this->company->id, 'store_id' => $this->storeA->id,
            'name' => 'Bodega A', 'type' => 'bodega', 'active' => true,
        ]);
        $this->exhibB = Warehouse::create([
            'company_id' => $this->company->id, 'store_id' => $this->storeB->id,
            'name' => 'Exhibición B', 'type' => 'store', 'active' => true,
        ]);

        $this->admin = $this->makeUser('admin@test.com', 'admin', null);
        // Gerente SIN can_view_cost: ve contadores de stock pero no de costo.
        $this->gerenteA = $this->makeUser('gerentea@test.com', 'gerente', $this->storeA->id);
        $this->gerenteSinTienda = $this->makeUser('sintienda@test.com', 'gerente', null);
    }

    private function makeProduct(string $name, ?float $cost = null, string $type = Product::TYPE_PRODUCT): Product
    {
        $p = Product::create([
            'company_id' => $this->company->id,
            'name' => $name, 'sku' => 'SKU-' . uniqid(), 'active' => true,
            'cost' => $cost, 'product_type' => $type,
        ]);
        $p->price()->create(['price_1' => 100]);

        return $p;
    }

    private function stock(Product $p, Warehouse $w, float $qty): void
    {
        Inventory::create(['product_id' => $p->id, 'warehouse_id' => $w->id, 'quantity' => $qty]);
    }

    public function test_contadores_globales(): void
    {
        // Matriz cost {NULL, 0, 50} × stock {0, 5, 20}
        $this->makeProduct('Sin costo agotado', null);                      // sin_costo + agotado
        $conCero = $this->makeProduct('Costo cero poco stock', 0.0);        // sin_costo + por_agotarse
        $this->stock($conCero, $this->exhibA, 5);
        $conCosto = $this->makeProduct('Con costo', 50.0);                  // valor 50×20 = 1000
        $this->stock($conCosto, $this->exhibA, 20);

        $data = $this->actingAs($this->admin)
            ->getJson('/api/v1/products/stats')
            ->assertOk()->assertJsonPath('success', true)->json('data');

        $this->assertSame(3, $data['total']);
        $this->assertSame(3, $data['total_productos']);
        $this->assertSame(0, $data['total_mangas']);
        $this->assertSame(2, $data['sin_costo']);
        $this->assertSame(1, $data['agotados']);
        $this->assertSame(1, $data['por_agotarse']);
        $this->assertSame(10, $data['threshold']);
        $this->assertSame(1000.0, (float) $data['valor_invertido']);
        $this->assertNull($data['store_id']);
    }

    public function test_threshold_parametrizable(): void
    {
        $p5 = $this->makeProduct('Cinco');
        $this->stock($p5, $this->exhibA, 5);
        $p15 = $this->makeProduct('Quince');
        $this->stock($p15, $this->exhibA, 15);

        $def = $this->actingAs($this->admin)->getJson('/api/v1/products/stats')->assertOk()->json('data');
        $this->assertSame(1, $def['por_agotarse'], 'Default 10: solo el de stock 5');

        $alto = $this->actingAs($this->admin)->getJson('/api/v1/products/stats?threshold=20')->assertOk()->json('data');
        $this->assertSame(2, $alto['por_agotarse']);
        $this->assertSame(20, $alto['threshold']);
    }

    public function test_scoped_por_tienda_suma_exhibicion_y_bodega(): void
    {
        // Stock solo en B → en A cuenta como agotado.
        $soloB = $this->makeProduct('Solo en B', 10.0);
        $this->stock($soloB, $this->exhibB, 5);
        // En A: 2 exhibición + 3 bodega = 5 → por_agotarse en A.
        $enA = $this->makeProduct('En A', 20.0);
        $this->stock($enA, $this->exhibA, 2);
        $this->stock($enA, $this->bodegaA, 3);

        $statsA = $this->actingAs($this->admin)
            ->getJson("/api/v1/products/stats?store_id={$this->storeA->id}")
            ->assertOk()->json('data');

        $this->assertSame($this->storeA->id, $statsA['store_id']);
        $this->assertSame(1, $statsA['agotados'], 'El que solo tiene stock en B está agotado en A');
        $this->assertSame(1, $statsA['por_agotarse'], 'Exhibición + bodega de A suman (2+3=5)');
        $this->assertSame(100.0, (float) $statsA['valor_invertido'], 'Solo el stock de A: 20×5');

        $statsB = $this->actingAs($this->admin)
            ->getJson("/api/v1/products/stats?store_id={$this->storeB->id}")
            ->assertOk()->json('data');
        $this->assertSame(1, $statsB['agotados'], 'El de A está agotado en B');
        $this->assertSame(50.0, (float) $statsB['valor_invertido'], '10×5 del stock en B');
    }

    public function test_filtro_por_type_manga(): void
    {
        $this->makeProduct('Producto normal', 10.0);
        $manga = $this->makeProduct('Tomo 1', null, Product::TYPE_MANGA);
        $this->stock($manga, $this->exhibA, 3);

        $data = $this->actingAs($this->admin)
            ->getJson('/api/v1/products/stats?type=manga')
            ->assertOk()->json('data');

        $this->assertSame(1, $data['total']);
        $this->assertSame(1, $data['total_mangas']);
        $this->assertSame(0, $data['total_productos']);
        $this->assertSame(1, $data['sin_costo']);
        $this->assertSame(1, $data['por_agotarse']);
    }

    public function test_con_promo_solo_vigentes_y_de_la_tienda(): void
    {
        $conPromo = $this->makeProduct('Con promo');
        ProductPromotion::create([
            'product_id' => $conPromo->id, 'store_id' => null,
            'name' => 'Global 2x1', 'buy_n' => 2, 'pay_m' => 1, 'status' => 'active', 'priority' => 0,
        ]);

        $vencida = $this->makeProduct('Promo vencida');
        ProductPromotion::create([
            'product_id' => $vencida->id, 'store_id' => null,
            'name' => 'Vencida', 'buy_n' => 2, 'pay_m' => 1, 'status' => 'active', 'priority' => 0,
            'ends_at' => now()->subDay(),
        ]);

        $deTiendaB = $this->makeProduct('Promo de B');
        ProductPromotion::create([
            'product_id' => $deTiendaB->id, 'store_id' => $this->storeB->id,
            'name' => 'Solo B', 'buy_n' => 3, 'pay_m' => 2, 'status' => 'active', 'priority' => 0,
        ]);

        // Global: la vigente global + la de tienda B (sin scope no se filtra).
        $global = $this->actingAs($this->admin)->getJson('/api/v1/products/stats')->assertOk()->json('data');
        $this->assertSame(2, $global['con_promo']);

        // Scoped a A: solo la global (la de B no aplica; la vencida tampoco).
        $enA = $this->actingAs($this->admin)
            ->getJson("/api/v1/products/stats?store_id={$this->storeA->id}")
            ->assertOk()->json('data');
        $this->assertSame(1, $enA['con_promo']);
    }

    public function test_claves_de_costo_ocultas_sin_can_view_cost(): void
    {
        $this->makeProduct('Sin costo', null);

        $data = $this->actingAs($this->gerenteA)
            ->getJson('/api/v1/products/stats')
            ->assertOk()->json('data');

        $this->assertArrayNotHasKey('sin_costo', $data);
        $this->assertArrayNotHasKey('valor_invertido', $data);
        $this->assertArrayHasKey('agotados', $data);
        $this->assertArrayHasKey('con_promo', $data);
    }

    public function test_gerente_anclado_a_su_tienda(): void
    {
        // Stock solo en B: para el gerente de A debe contar como agotado
        // aunque intente pedir stats de B por query string.
        $soloB = $this->makeProduct('Solo en B');
        $this->stock($soloB, $this->exhibB, 5);

        $data = $this->actingAs($this->gerenteA)
            ->getJson("/api/v1/products/stats?store_id={$this->storeB->id}")
            ->assertOk()->json('data');

        $this->assertSame($this->storeA->id, $data['store_id'], 'El store_id del request se ignora para no-admin');
        $this->assertSame(1, $data['agotados']);
    }

    public function test_fail_closed_sin_tienda_asignada(): void
    {
        $p = $this->makeProduct('Con stock');
        $this->stock($p, $this->exhibA, 5);

        $data = $this->actingAs($this->gerenteSinTienda)
            ->getJson('/api/v1/products/stats')
            ->assertOk()->json('data');

        $this->assertSame(-1, $data['store_id']);
        $this->assertSame($data['total'], $data['agotados'], 'Sin tienda no matchea inventario: todo agotado');
    }

    public function test_ruta_stats_no_colisiona_con_show(): void
    {
        // Si la ruta quedara DESPUÉS del apiResource, products/{product}
        // capturaría "stats" como id y el model binding daría 404.
        $this->actingAs($this->admin)
            ->getJson('/api/v1/products/stats')
            ->assertOk()
            ->assertJsonPath('success', true)
            ->assertJsonStructure(['data' => ['total', 'agotados', 'por_agotarse', 'con_promo', 'threshold']]);
    }

    private function makeUser(string $email, string $roleName, ?int $storeId): User
    {
        $user = User::create([
            'name' => $email, 'email' => $email, 'password' => bcrypt('password'),
            'company_id' => $this->company->id, 'store_id' => $storeId, 'active' => true,
        ]);

        $roleId = DB::table('roles')->where('name', $roleName)->value('id')
            ?? DB::table('roles')->insertGetId([
                'name' => $roleName, 'guard_name' => 'api',
                'created_at' => now(), 'updated_at' => now(),
            ]);

        DB::table('model_has_roles')->insert([
            'role_id' => $roleId, 'model_type' => User::class, 'model_id' => $user->id,
        ]);

        return $user;
    }
}
