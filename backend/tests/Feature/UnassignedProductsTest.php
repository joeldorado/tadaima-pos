<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Inventory;
use App\Models\Product;
use App\Models\Store;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Productos/tomos "no asignados" visibles en todas las tiendas (2026-06-24).
 *
 * Por defecto el listado por tienda solo trae productos CON inventario ahí.
 * Con ?include_unassigned=1 también trae los "no asignados" (sin renglón de
 * inventario en la tienda) con stock 0 + is_assigned=false, para que cada
 * sucursal (gerente o cajero) les agregue stock ella misma.
 */
class UnassignedProductsTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;
    private Store $storeA;
    private Store $storeB;
    private Warehouse $exhibA;
    private Warehouse $exhibB;
    private User $admin;
    private User $cajeroB;

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
        $this->exhibB = Warehouse::create([
            'company_id' => $this->company->id, 'store_id' => $this->storeB->id,
            'name' => 'Exhibición B', 'type' => 'store', 'active' => true,
        ]);

        $this->admin   = $this->makeUser('admin@test.com', 'admin', null);
        $this->cajeroB = $this->makeUser('cajerob@test.com', 'cajero', $this->storeB->id);
    }

    private function makeProduct(string $name): Product
    {
        $p = Product::create([
            'company_id' => $this->company->id,
            'name' => $name, 'sku' => 'SKU-' . uniqid(), 'active' => true,
        ]);
        $p->price()->create(['price_1' => 100]);
        return $p;
    }

    private function makeManga(string $name): Product
    {
        $m = Product::create([
            'company_id' => $this->company->id,
            'name' => $name, 'sku' => 'MNG-' . uniqid(), 'active' => true,
            'product_type' => Product::TYPE_MANGA,
        ]);
        $m->mangaDetails()->create(['volume_number' => 1, 'editorial' => 'Ed', 'genre' => 'shonen']);
        $m->price()->create(['price_1' => 150]);
        return $m;
    }

    // ── Productos ─────────────────────────────────────────────────────────────

    public function test_default_index_excludes_unassigned_products(): void
    {
        $assigned = $this->makeProduct('Asignado');
        Inventory::create(['product_id' => $assigned->id, 'warehouse_id' => $this->exhibA->id, 'quantity' => 5]);
        $unassigned = $this->makeProduct('No asignado'); // sin inventario en ningún lado

        $ids = collect($this->actingAs($this->admin)
            ->getJson("/api/v1/products?store_id={$this->storeA->id}&per_page=0")
            ->assertOk()->json('data'))->pluck('id');

        $this->assertTrue($ids->contains($assigned->id));
        $this->assertFalse($ids->contains($unassigned->id), 'Sin la bandera, el no asignado NO debe aparecer');
    }

    public function test_include_unassigned_returns_unassigned_with_flag_false_and_zero_stock(): void
    {
        $assigned = $this->makeProduct('Asignado');
        Inventory::create(['product_id' => $assigned->id, 'warehouse_id' => $this->exhibA->id, 'quantity' => 5]);
        $unassigned = $this->makeProduct('No asignado');

        // light=1 = path de Caja (ProductLightResource)
        $rows = collect($this->actingAs($this->admin)
            ->getJson("/api/v1/products?light=1&store_id={$this->storeA->id}&include_unassigned=1&per_page=0")
            ->assertOk()->json('data'))->keyBy('id');

        $this->assertTrue($rows->has($unassigned->id), 'El no asignado SÍ debe aparecer con la bandera');
        $this->assertFalse($rows[$unassigned->id]['is_assigned']);
        $this->assertSame(0.0, (float) $rows[$unassigned->id]['stock_total']);

        $this->assertTrue($rows[$assigned->id]['is_assigned']);
        $this->assertSame(5.0, (float) $rows[$assigned->id]['stock_total']);
    }

    public function test_global_index_omits_is_assigned(): void
    {
        $p = $this->makeProduct('Global');

        $row = collect($this->actingAs($this->admin)
            ->getJson('/api/v1/products?per_page=0')
            ->assertOk()->json('data'))->firstWhere('id', $p->id);

        $this->assertArrayNotHasKey('is_assigned', $row, 'Sin store_id no se expone is_assigned');
    }

    public function test_cajero_can_add_stock_to_unassigned_then_it_becomes_assigned(): void
    {
        $unassigned = $this->makeProduct('No asignado');

        $before = collect($this->actingAs($this->cajeroB)
            ->getJson("/api/v1/products?light=1&store_id={$this->storeB->id}&include_unassigned=1&per_page=0")
            ->assertOk()->json('data'))->firstWhere('id', $unassigned->id);
        $this->assertFalse($before['is_assigned']);

        // El cajero agrega stock a la Exhibición de SU tienda.
        $this->actingAs($this->cajeroB)
            ->putJson("/api/v1/inventory/{$unassigned->id}/{$this->exhibB->id}", ['quantity' => 7])
            ->assertOk();

        $after = collect($this->actingAs($this->cajeroB)
            ->getJson("/api/v1/products?light=1&store_id={$this->storeB->id}&include_unassigned=1&per_page=0")
            ->assertOk()->json('data'))->firstWhere('id', $unassigned->id);
        $this->assertTrue($after['is_assigned']);
        $this->assertSame(7.0, (float) $after['stock_total']);
    }

    public function test_cajero_cannot_add_stock_to_another_store(): void
    {
        $p = $this->makeProduct('X');

        $this->actingAs($this->cajeroB)
            ->putJson("/api/v1/inventory/{$p->id}/{$this->exhibA->id}", ['quantity' => 3])
            ->assertStatus(403);
    }

    // ── Tomos / mangas ─────────────────────────────────────────────────────────

    public function test_manga_index_respects_include_unassigned(): void
    {
        $assigned = $this->makeManga('Tomo asignado');
        Inventory::create(['product_id' => $assigned->id, 'warehouse_id' => $this->exhibA->id, 'quantity' => 4]);
        $unassigned = $this->makeManga('Tomo no asignado');

        // Default excluye.
        $def = collect($this->actingAs($this->admin)
            ->getJson("/api/v1/mangas?store_id={$this->storeA->id}")
            ->assertOk()->json('data.data'))->pluck('id');
        $this->assertTrue($def->contains($assigned->id));
        $this->assertFalse($def->contains($unassigned->id));

        // Con bandera incluye + flag.
        $all = collect($this->actingAs($this->admin)
            ->getJson("/api/v1/mangas?store_id={$this->storeA->id}&include_unassigned=1")
            ->assertOk()->json('data.data'))->keyBy('id');
        $this->assertFalse($all[$unassigned->id]['is_assigned']);
        $this->assertSame(0.0, (float) $all[$unassigned->id]['stock']);
        $this->assertTrue($all[$assigned->id]['is_assigned']);
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
