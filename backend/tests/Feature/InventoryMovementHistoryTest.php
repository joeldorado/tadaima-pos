<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Inventory;
use App\Models\InventoryMovement;
use App\Models\Product;
use App\Models\Store;
use App\Models\User;
use App\Models\Warehouse;
use App\Services\ActivityFeedService;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Historial de stock por producto (2026-11-19): GET /inventory/movements con
 * with_meta=1 alimenta el modal «Historial» de Productos y Existencias.
 * Gerente y cajero solo ven su tienda.
 */
class InventoryMovementHistoryTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;
    private Store $storeA;
    private Store $storeB;
    private Warehouse $exhA;
    private Warehouse $bodA;
    private Warehouse $exhB;
    private User $admin;
    private User $cajeroA;
    private Product $product;

    protected function setUp(): void
    {
        parent::setUp();

        $this->company = Company::create(['name' => 'Tadaima Test']);
        $this->storeA = Store::create(['company_id' => $this->company->id, 'name' => 'Tienda A', 'active' => true]);
        $this->storeB = Store::create(['company_id' => $this->company->id, 'name' => 'Tienda B', 'active' => true]);

        $this->exhA = $this->makeWarehouse($this->storeA, 'Exhibición A', 'store');
        $this->bodA = $this->makeWarehouse($this->storeA, 'Bodega A', 'bodega');
        $this->exhB = $this->makeWarehouse($this->storeB, 'Exhibición B', 'store');

        $this->admin   = $this->makeUser('admin@test.com', 'admin', null);
        $this->cajeroA = $this->makeUser('cajero.a@test.com', 'cajero', $this->storeA->id);

        $this->product = Product::create([
            'name' => 'Producto Test', 'sku' => 'SKU-1', 'price_1' => 100, 'active' => true,
        ]);
    }

    // ── Signo de los apartados ────────────────────────────────────────────────

    public function test_apartado_saca_stock_y_su_cancelacion_lo_regresa(): void
    {
        $apartado  = new InventoryMovement(['type' => 'apartado', 'quantity' => 2]);
        $cancelado = new InventoryMovement(['type' => 'apartado_cancelado', 'quantity' => 2]);

        $this->assertSame(-2.0, $apartado->stockDelta());
        $this->assertSame(2.0, $cancelado->stockDelta());
        // El feed de Actividad usa la misma regla.
        $this->assertSame(-2.0, ActivityFeedService::stockDelta('apartado', 2));
        $this->assertSame(2.0, ActivityFeedService::stockDelta('apartado_cancelado', 2));
    }

    public function test_apartado_no_se_captura_a_mano(): void
    {
        $this->actingAs($this->admin)->postJson('/api/v1/inventory/movements', [
            'product_id' => $this->product->id, 'warehouse_id' => $this->exhA->id,
            'type' => 'apartado', 'quantity' => 1,
        ])->assertStatus(422);
    }

    // ── Endpoint ──────────────────────────────────────────────────────────────

    public function test_cajero_ve_solo_su_tienda_con_saldo_actual_y_paginacion(): void
    {
        Inventory::create(['product_id' => $this->product->id, 'warehouse_id' => $this->exhA->id, 'quantity' => 7]);
        Inventory::create(['product_id' => $this->product->id, 'warehouse_id' => $this->bodA->id, 'quantity' => 3]);
        Inventory::create(['product_id' => $this->product->id, 'warehouse_id' => $this->exhB->id, 'quantity' => 40]);

        $this->movement($this->exhA, 'venta', 1, 'VENTA-1', $this->cajeroA->id);
        $this->movement($this->exhA, 'apartado', 2, 'APARTADO-5', $this->cajeroA->id);
        $this->movement($this->bodA, 'entrada', 3, 'IMPORT-MACRO', $this->admin->id);
        $this->movement($this->exhB, 'entrada', 40, null, $this->admin->id);

        $res = $this->actingAs($this->cajeroA)
            ->getJson("/api/v1/inventory/movements?product_id={$this->product->id}&with_meta=1&per_page=2")
            ->assertOk();

        $res->assertJsonPath('data.pagination.total', 3)
            ->assertJsonPath('data.pagination.last_page', 2)
            ->assertJsonCount(2, 'data.data');

        $stock = collect($res->json('data.current_stock'))->keyBy('warehouse_id');
        $this->assertEqualsCanonicalizing([$this->exhA->id, $this->bodA->id], $stock->keys()->all());
        $this->assertSame(7.0, (float) $stock[$this->exhA->id]['quantity']);
        $this->assertSame('Tienda A', $stock[$this->exhA->id]['store_name']);
        $this->assertSame('bodega', $stock[$this->bodA->id]['warehouse_type']);

        $all = collect($this->actingAs($this->cajeroA)
            ->getJson("/api/v1/inventory/movements?product_id={$this->product->id}&with_meta=1&per_page=50")
            ->json('data.data'))->keyBy('type');

        $this->assertSame(-2.0, (float) $all['apartado']['stock_delta']);
        $this->assertSame('APARTADO-5', $all['apartado']['reference']);
        $this->assertSame(-1.0, (float) $all['venta']['stock_delta']);
        $this->assertSame('Tienda A', $all['venta']['warehouse']['store_name']);
        $this->assertSame('cajero.a@test.com', $all['venta']['user']['name']);
        $this->assertSame('bodega', $all['entrada']['warehouse']['type']);
    }

    public function test_admin_filtra_por_tienda(): void
    {
        $this->movement($this->exhA, 'entrada', 1, null, $this->admin->id);
        $this->movement($this->exhB, 'entrada', 1, null, $this->admin->id);

        $this->actingAs($this->admin)
            ->getJson("/api/v1/inventory/movements?product_id={$this->product->id}&with_meta=1&store_id={$this->storeB->id}")
            ->assertOk()
            ->assertJsonCount(1, 'data.data')
            ->assertJsonPath('data.data.0.warehouse.id', $this->exhB->id);
    }

    public function test_cajero_no_ve_otra_tienda_aunque_la_pida(): void
    {
        Inventory::create(['product_id' => $this->product->id, 'warehouse_id' => $this->exhB->id, 'quantity' => 4]);
        $this->movement($this->exhB, 'entrada', 4, null, $this->admin->id);

        $this->actingAs($this->cajeroA)
            ->getJson("/api/v1/inventory/movements?product_id={$this->product->id}&with_meta=1&store_id={$this->storeB->id}")
            ->assertOk()
            ->assertJsonCount(0, 'data.data')
            ->assertJsonCount(0, 'data.current_stock');
    }

    public function test_rango_de_fechas_usa_el_dia_de_tijuana(): void
    {
        // 2026-11-19 05:00 UTC = 2026-11-18 21:00 en Tijuana.
        $m = $this->movement($this->exhA, 'venta', 1, 'VENTA-9', $this->admin->id);
        $m->forceFill(['created_at' => Carbon::parse('2026-11-19 05:00:00', 'UTC')])->save();

        $this->actingAs($this->admin)
            ->getJson("/api/v1/inventory/movements?product_id={$this->product->id}&with_meta=1&from=2026-11-18&to=2026-11-18")
            ->assertOk()->assertJsonCount(1, 'data.data');
        $this->actingAs($this->admin)
            ->getJson("/api/v1/inventory/movements?product_id={$this->product->id}&with_meta=1&from=2026-11-19&to=2026-11-19")
            ->assertOk()->assertJsonCount(0, 'data.data');
    }

    public function test_sin_with_meta_conserva_la_forma_vieja(): void
    {
        $this->movement($this->exhA, 'entrada', 1, null, $this->admin->id);

        $this->actingAs($this->admin)->getJson('/api/v1/inventory/movements')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.type', 'entrada');
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private function movement(Warehouse $wh, string $type, float $qty, ?string $ref, int $userId): InventoryMovement
    {
        return InventoryMovement::create([
            'product_id' => $this->product->id, 'warehouse_id' => $wh->id,
            'type' => $type, 'quantity' => $qty, 'reference' => $ref, 'user_id' => $userId,
        ]);
    }

    private function makeWarehouse(Store $store, string $name, string $type): Warehouse
    {
        return Warehouse::create([
            'company_id' => $this->company->id, 'store_id' => $store->id,
            'name' => $name, 'type' => $type, 'active' => true,
        ]);
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
