<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\CashRegister;
use App\Models\CashRegisterSession;
use App\Models\Company;
use App\Models\Store;
use App\Models\Supply;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Scoping por empresa de Insumos (fix 2026-07-16): el catálogo se comparte
 * entre tiendas de UNA empresa pero nunca entre empresas — index filtra,
 * update y movements validan pertenencia.
 */
class SupplyCompanyScopeTest extends TestCase
{
    use RefreshDatabase;

    private User $managerA;
    private Supply $supplyA;
    private Supply $supplyB;

    protected function setUp(): void
    {
        parent::setUp();

        $companyA = Company::create(['name' => 'Empresa A']);
        $companyB = Company::create(['name' => 'Empresa B']);
        $storeA = Store::create(['company_id' => $companyA->id, 'name' => 'Tienda A']);

        $this->managerA = User::create([
            'name' => 'Gerente A', 'email' => 'gerente.a@test.com', 'password' => bcrypt('x'),
            'company_id' => $companyA->id, 'store_id' => $storeA->id,
        ]);
        $this->assignRole($this->managerA, 'gerente');

        $register = CashRegister::create(['store_id' => $storeA->id, 'name' => 'Caja A', 'active' => true]);
        CashRegisterSession::create([
            'register_id' => $register->id, 'user_id' => $this->managerA->id,
            'opening_cash' => 500, 'status' => 'open', 'opened_at' => now(),
        ]);

        $this->supplyA = Supply::create(['company_id' => $companyA->id, 'name' => 'Cinta A']);
        $this->supplyB = Supply::create(['company_id' => $companyB->id, 'name' => 'Cinta B']);
    }

    private function assignRole(User $user, string $role): void
    {
        $roleId = DB::table('roles')->where('name', $role)->value('id')
            ?? DB::table('roles')->insertGetId(['name' => $role, 'created_at' => now(), 'updated_at' => now()]);
        DB::table('model_has_roles')->insert([
            'role_id' => $roleId, 'model_type' => User::class, 'model_id' => $user->id,
        ]);
    }

    public function test_index_only_returns_own_company_supplies(): void
    {
        $resp = $this->actingAs($this->managerA)->getJson('/api/v1/supplies?all=1');

        $resp->assertOk();
        $names = array_column($resp->json('data'), 'name');
        $this->assertContains('Cinta A', $names);
        $this->assertNotContains('Cinta B', $names);
    }

    public function test_update_rejects_foreign_company_supply(): void
    {
        $this->actingAs($this->managerA)
            ->putJson("/api/v1/supplies/{$this->supplyB->id}", ['name' => 'Hackeada'])
            ->assertStatus(403);

        $this->assertSame('Cinta B', $this->supplyB->fresh()->name);
    }

    public function test_movement_rejects_foreign_company_supply(): void
    {
        $this->actingAs($this->managerA)
            ->postJson('/api/v1/supplies/movements', [
                'supply_id' => $this->supplyB->id, 'quantity' => 1, 'amount' => 50,
            ])
            ->assertStatus(403);
    }

    public function test_movement_ok_for_own_company_supply(): void
    {
        $this->actingAs($this->managerA)
            ->postJson('/api/v1/supplies/movements', [
                'supply_id' => $this->supplyA->id, 'quantity' => 1, 'amount' => 50,
            ])
            ->assertStatus(201);
    }
}
