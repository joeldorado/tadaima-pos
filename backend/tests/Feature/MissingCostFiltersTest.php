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
 * Modal "Productos sin Costo" (Joel 2026-09-25): chips de stock
 * (?no_cost_stock=con_stock|exhibicion|bodega|todos), orden ?sort=stock_desc
 * y contadores GET /products/missing-cost/summary (scope fail-closed + costo).
 */
class MissingCostFiltersTest extends TestCase
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
    private User $gerenteConCosto;

    private Product $soloExhib;   // sin costo, 2 en Exhibición A
    private Product $soloBodega;  // sin costo, 7 en Bodega A
    private Product $ambos;       // sin costo, 1 Exh A + 4 Bod A
    private Product $soloEnB;     // sin costo, 9 en Exhibición B
    private Product $agotado;     // sin costo, sin stock
    private Product $conCosto;    // costo 50, 30 en Exhibición A (nunca sale)

    protected function setUp(): void
    {
        parent::setUp();

        $this->company = Company::create(['name' => 'Tadaima Test']);
        $this->storeA = Store::create(['company_id' => $this->company->id, 'name' => 'Tienda A', 'active' => true]);
        $this->storeB = Store::create(['company_id' => $this->company->id, 'name' => 'Tienda B', 'active' => true]);
        $this->exhibA = $this->warehouse($this->storeA, 'store');
        $this->bodegaA = $this->warehouse($this->storeA, 'bodega');
        $this->exhibB = $this->warehouse($this->storeB, 'store');

        $this->admin = $this->makeUser('admin@test.com', 'admin', null);
        $this->gerenteA = $this->makeUser('gerentea@test.com', 'gerente', $this->storeA->id);
        $this->gerenteConCosto = $this->makeUser('gerentecosto@test.com', 'gerente', $this->storeA->id, true);

        $this->soloExhib = $this->makeProduct('Solo Exhib', null, [[$this->exhibA, 2]]);
        $this->soloBodega = $this->makeProduct('Solo Bodega', 0.0, [[$this->bodegaA, 7]]);
        $this->ambos = $this->makeProduct('Ambos', null, [[$this->exhibA, 1], [$this->bodegaA, 4]]);
        $this->soloEnB = $this->makeProduct('Solo en B', null, [[$this->exhibB, 9]]);
        $this->agotado = $this->makeProduct('Agotado', null, []);
        $this->conCosto = $this->makeProduct('Con costo', 50.0, [[$this->exhibA, 30]]);
    }

    public function test_default_sigue_siendo_con_stock(): void
    {
        $this->assertSame(
            $this->sorted([$this->soloExhib, $this->soloBodega, $this->ambos, $this->soloEnB]),
            $this->ids('&no_cost=1'),
        );
        $this->assertSame($this->ids('&no_cost=1'), $this->ids('&no_cost=1&no_cost_stock=con_stock'));
    }

    public function test_chips_con_tienda(): void
    {
        $s = "&no_cost=1&store_id={$this->storeA->id}&include_unassigned=1";
        $this->assertSame($this->sorted([$this->soloExhib, $this->soloBodega, $this->ambos]), $this->ids($s));
        $this->assertSame($this->sorted([$this->soloExhib, $this->ambos]), $this->ids("{$s}&no_cost_stock=exhibicion"));
        $this->assertSame($this->sorted([$this->soloBodega, $this->ambos]), $this->ids("{$s}&no_cost_stock=bodega"));
        // "todos" incluye agotados (en esta tienda, Solo en B también cuenta como agotado).
        $this->assertSame(
            $this->sorted([$this->soloExhib, $this->soloBodega, $this->ambos, $this->soloEnB, $this->agotado]),
            $this->ids("{$s}&no_cost_stock=todos"),
        );
    }

    public function test_chips_sin_tienda_suman_todas(): void
    {
        $this->assertSame(
            $this->sorted([$this->soloExhib, $this->ambos, $this->soloEnB]),
            $this->ids('&no_cost=1&no_cost_stock=exhibicion'),
        );
        $this->assertSame($this->sorted([$this->soloBodega, $this->ambos]), $this->ids('&no_cost=1&no_cost_stock=bodega'));
    }

    public function test_sort_stock_desc(): void
    {
        $json = $this->actingAs($this->admin)
            ->getJson('/api/v1/products?per_page=0&no_cost=1&sort=stock_desc')
            ->assertOk()->json('data');

        // 9 (Solo en B) > 7 (Solo Bodega) > 5 (Ambos) > 2 (Solo Exhib)
        $this->assertSame(
            [$this->soloEnB->id, $this->soloBodega->id, $this->ambos->id, $this->soloExhib->id],
            collect($json)->pluck('id')->all(),
        );
    }

    public function test_summary_admin_con_y_sin_tienda(): void
    {
        $global = $this->actingAs($this->admin)
            ->getJson('/api/v1/products/missing-cost/summary')
            ->assertOk()->json('data');
        $this->assertSame(
            ['con_stock' => 4, 'exhibicion' => 3, 'bodega' => 2, 'todos' => 5],
            array_intersect_key($global, array_flip(['con_stock', 'exhibicion', 'bodega', 'todos'])),
        );

        $enA = $this->actingAs($this->admin)
            ->getJson("/api/v1/products/missing-cost/summary?store_id={$this->storeA->id}")
            ->assertOk()->json('data');
        $this->assertSame(3, $enA['con_stock']);
        $this->assertSame(2, $enA['exhibicion']);
        $this->assertSame(2, $enA['bodega']);
        $this->assertSame(5, $enA['todos']);
    }

    public function test_summary_gerente_anclado_a_su_tienda(): void
    {
        // Pide la tienda B por query string: se ignora, queda en A.
        $data = $this->actingAs($this->gerenteConCosto)
            ->getJson("/api/v1/products/missing-cost/summary?store_id={$this->storeB->id}")
            ->assertOk()->json('data');

        $this->assertSame($this->storeA->id, $data['store_id']);
        $this->assertSame(3, $data['con_stock']);
    }

    public function test_summary_sin_can_view_cost_es_403(): void
    {
        $this->actingAs($this->gerenteA)
            ->getJson('/api/v1/products/missing-cost/summary')
            ->assertStatus(403);
    }

    private function sorted(array $products): array
    {
        return collect($products)->pluck('id')->sort()->values()->all();
    }

    private function ids(string $qs): array
    {
        $json = $this->actingAs($this->admin)
            ->getJson("/api/v1/products?per_page=0{$qs}")
            ->assertOk()->json('data');

        return collect($json)->pluck('id')->sort()->values()->all();
    }

    private function warehouse(Store $store, string $type): Warehouse
    {
        return Warehouse::create([
            'company_id' => $this->company->id, 'store_id' => $store->id,
            'name' => "{$type} {$store->name}", 'type' => $type, 'active' => true,
        ]);
    }

    /** @param array<int, array{0: Warehouse, 1: float}> $stock */
    private function makeProduct(string $name, ?float $cost, array $stock): Product
    {
        $p = Product::create([
            'company_id' => $this->company->id,
            'name' => $name, 'sku' => 'SKU-' . uniqid(), 'active' => true, 'cost' => $cost,
        ]);
        $p->price()->create(['price_1' => 100]);
        foreach ($stock as [$wh, $qty]) {
            Inventory::create(['product_id' => $p->id, 'warehouse_id' => $wh->id, 'quantity' => $qty]);
        }

        return $p;
    }

    private function makeUser(string $email, string $roleName, ?int $storeId, bool $canViewCost = false): User
    {
        $user = User::create([
            'name' => $email, 'email' => $email, 'password' => bcrypt('password'),
            'company_id' => $this->company->id, 'store_id' => $storeId, 'active' => true,
        ]);
        if ($canViewCost) {
            $user->forceFill(['can_view_cost' => true])->save();
        }

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
