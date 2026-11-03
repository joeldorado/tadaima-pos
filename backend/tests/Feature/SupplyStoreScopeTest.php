<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Store;
use App\Models\Supply;
use App\Models\SupplyMovement;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Aislamiento por tienda en insumos (2026-11-03): el gerente veía los registros y
 * el gasto de todas las tiendas en `GET /supplies/movements` y `GET /reports/supplies`.
 */
class SupplyStoreScopeTest extends TestCase
{
    use RefreshDatabase;

    private Store $storeA;
    private Store $storeB;
    private User $admin;
    private User $gerenteA;
    private User $cajeroA;

    protected function setUp(): void
    {
        parent::setUp();

        $company = Company::create(['name' => 'Tadaima Test']);
        $this->storeA = Store::create(['company_id' => $company->id, 'name' => 'Tienda A', 'active' => true]);
        $this->storeB = Store::create(['company_id' => $company->id, 'name' => 'Tienda B', 'active' => true]);
        $this->admin = $this->makeUser($company, 'admin', $this->storeA);
        $this->gerenteA = $this->makeUser($company, 'gerente', $this->storeA);
        $this->cajeroA = $this->makeUser($company, 'cajero', $this->storeA);

        $supply = Supply::create(['company_id' => $company->id, 'name' => 'Cinta', 'category' => 'Empaque']);
        $this->purchase($supply, $this->storeA, 100);
        $this->purchase($supply, $this->storeB, 250);
    }

    private function makeUser(Company $company, string $role, Store $store): User
    {
        $user = User::create([
            'name' => ucfirst($role), 'email' => "{$role}@test.com", 'password' => bcrypt('x'),
            'company_id' => $company->id, 'store_id' => $store->id, 'active' => true,
        ]);
        $roleId = DB::table('roles')->where('name', $role)->value('id')
            ?? DB::table('roles')->insertGetId(['name' => $role, 'guard_name' => 'api', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('model_has_roles')->insert(['role_id' => $roleId, 'model_type' => User::class, 'model_id' => $user->id]);

        return $user;
    }

    private function purchase(Supply $supply, Store $store, float $amount): void
    {
        SupplyMovement::create([
            'supply_id' => $supply->id, 'store_id' => $store->id, 'type' => SupplyMovement::TYPE_PURCHASE,
            'quantity' => 1, 'amount' => $amount, 'money_source' => 'propio', 'user_id' => $this->admin->id,
        ]);
    }

    public function test_gerente_solo_ve_los_registros_de_su_tienda(): void
    {
        $this->actingAs($this->gerenteA)
            ->getJson('/api/v1/supplies/movements')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.store_id', $this->storeA->id);
    }

    public function test_gerente_recibe_403_al_pedir_otra_tienda(): void
    {
        $this->actingAs($this->gerenteA)
            ->getJson("/api/v1/supplies/movements?store_id={$this->storeB->id}")
            ->assertStatus(403);

        $this->actingAs($this->gerenteA)
            ->getJson("/api/v1/supplies/movements?store_id={$this->storeA->id}")
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }

    public function test_admin_sigue_viendo_todas_las_tiendas(): void
    {
        $this->actingAs($this->admin)
            ->getJson('/api/v1/supplies/movements')
            ->assertOk()
            ->assertJsonCount(2, 'data');

        $this->actingAs($this->admin)
            ->getJson("/api/v1/supplies/movements?store_id={$this->storeB->id}")
            ->assertOk()
            ->assertJsonCount(1, 'data');
    }

    public function test_reporte_de_insumos_del_gerente_solo_suma_su_tienda(): void
    {
        $range = 'from='.now()->subDay()->toDateString().'&to='.now()->addDay()->toDateString();

        $this->actingAs($this->gerenteA)
            ->getJson("/api/v1/reports/supplies?{$range}")
            ->assertOk()
            ->assertJsonPath('data.total', 100);

        $this->actingAs($this->cajeroA)
            ->getJson("/api/v1/reports/supplies?{$range}")
            ->assertOk()
            ->assertJsonPath('data.total', 100);

        $this->actingAs($this->admin)
            ->getJson("/api/v1/reports/supplies?{$range}")
            ->assertOk()
            ->assertJsonPath('data.total', 350);
    }
}
