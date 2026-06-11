<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Decisión 2026-06-10: al crear un gerente CON tienda asignada, can_view_cost
 * se enciende automáticamente (el admin puede apagarlo después desde Permisos
 * de Precios). Aplica en el alta (POST /users con role_id) y al cambiar el rol
 * (POST /users/{id}/roles).
 */
class GerenteAutoCostTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;
    private Store $store;
    private User $admin;
    private int $gerenteRoleId;
    private int $cajeroRoleId;

    protected function setUp(): void
    {
        parent::setUp();

        $this->company = Company::create(['name' => 'Tadaima Test']);
        $this->store = Store::create(['company_id' => $this->company->id, 'name' => 'Tienda Centro', 'active' => true]);

        $this->admin = User::create([
            'name' => 'Admin', 'email' => 'admin@test.com', 'password' => bcrypt('password'),
            'company_id' => $this->company->id, 'active' => true,
        ]);
        $adminRoleId = $this->makeRole('admin');
        DB::table('model_has_roles')->insert([
            'role_id' => $adminRoleId, 'model_type' => User::class, 'model_id' => $this->admin->id,
        ]);

        $this->gerenteRoleId = $this->makeRole('gerente');
        $this->cajeroRoleId  = $this->makeRole('cajero');
    }

    public function test_creating_gerente_with_store_enables_can_view_cost(): void
    {
        $resp = $this->actingAs($this->admin)
            ->postJson('/api/v1/users', [
                'name' => 'Gerente Nuevo', 'email' => 'gerente@test.com',
                'password' => 'Password123', 'active' => true,
                'store_id' => $this->store->id, 'role_id' => $this->gerenteRoleId,
            ])
            ->assertCreated();

        $created = User::find($resp->json('data.id'));
        $this->assertTrue((bool) $created->can_view_cost);
    }

    public function test_creating_gerente_without_store_does_not_enable_cost(): void
    {
        $resp = $this->actingAs($this->admin)
            ->postJson('/api/v1/users', [
                'name' => 'Gerente Sin Tienda', 'email' => 'gerente2@test.com',
                'password' => 'Password123', 'active' => true,
                'role_id' => $this->gerenteRoleId,
            ])
            ->assertCreated();

        $this->assertFalse((bool) User::find($resp->json('data.id'))->can_view_cost);
    }

    public function test_creating_cajero_with_store_does_not_enable_cost(): void
    {
        $resp = $this->actingAs($this->admin)
            ->postJson('/api/v1/users', [
                'name' => 'Cajero Nuevo', 'email' => 'cajero@test.com',
                'password' => 'Password123', 'active' => true,
                'store_id' => $this->store->id, 'role_id' => $this->cajeroRoleId,
            ])
            ->assertCreated();

        $this->assertFalse((bool) User::find($resp->json('data.id'))->can_view_cost);
    }

    public function test_assigning_gerente_role_to_user_with_store_enables_cost(): void
    {
        $user = User::create([
            'name' => 'Cajero Promovido', 'email' => 'promovido@test.com',
            'password' => bcrypt('password'), 'company_id' => $this->company->id,
            'store_id' => $this->store->id, 'active' => true,
        ]);
        DB::table('model_has_roles')->insert([
            'role_id' => $this->cajeroRoleId, 'model_type' => User::class, 'model_id' => $user->id,
        ]);
        $this->assertFalse((bool) $user->can_view_cost);

        $this->actingAs($this->admin)
            ->postJson("/api/v1/users/{$user->id}/roles", ['role_id' => $this->gerenteRoleId])
            ->assertOk();

        $this->assertTrue((bool) $user->fresh()->can_view_cost);
    }

    public function test_admin_can_still_revoke_cost_after_auto_grant(): void
    {
        $resp = $this->actingAs($this->admin)
            ->postJson('/api/v1/users', [
                'name' => 'Gerente Revocable', 'email' => 'revocable@test.com',
                'password' => 'Password123', 'active' => true,
                'store_id' => $this->store->id, 'role_id' => $this->gerenteRoleId,
            ])
            ->assertCreated();

        $id = $resp->json('data.id');

        // El flujo de "Permisos de Precios" apaga el flag vía PUT /users/{id}
        $this->actingAs($this->admin)
            ->putJson("/api/v1/users/{$id}", [
                'name' => 'Gerente Revocable', 'email' => 'revocable@test.com',
                'active' => true, 'store_id' => $this->store->id,
                'can_view_cost' => false,
            ])
            ->assertOk();

        $this->assertFalse((bool) User::find($id)->can_view_cost);
    }

    private function makeRole(string $name): int
    {
        return DB::table('roles')->insertGetId([
            'name' => $name, 'guard_name' => 'api',
            'created_at' => now(), 'updated_at' => now(),
        ]);
    }
}
