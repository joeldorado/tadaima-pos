<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Asignación de roles a usuarios desde el panel de admin.
 *
 * Bug QA Ruben 2026-06-03: al cambiar el rol de un usuario, el endpoint
 * assignRole hacía un INSERT idempotente que nunca borraba el rol anterior,
 * dejando al usuario con ambos (p. ej. admin + cajero). Fix: sincroniza
 * (borra + inserta) ya que el form sólo permite un rol. También se removió un
 * eager-load roto `with('roles')` en /users/online (roles es accessor, no
 * relación Eloquent → RelationNotFoundException).
 */
class UserRoleAssignmentTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;
    private Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        $this->company = Company::create(['name' => 'Tadaima Test']);
        $this->store = Store::create([
            'company_id' => $this->company->id,
            'name' => 'Tienda Centro',
            'active' => true,
        ]);
    }

    public function test_assign_role_replaces_previous_role_instead_of_accumulating(): void
    {
        $admin = $this->makeUser('admin@test.com');
        $this->seedRole($admin, 'admin');

        $target = $this->makeUser('cajero@test.com');
        $cajeroId = $this->seedRole($target, 'cajero');
        $gerenteId = DB::table('roles')->insertGetId([
            'name' => 'gerente', 'guard_name' => 'api',
            'created_at' => now(), 'updated_at' => now(),
        ]);

        // Cambiar de cajero → gerente
        $this->actingAs($admin)
            ->postJson("/api/v1/users/{$target->id}/roles", ['role_id' => $gerenteId])
            ->assertOk();

        $roles = DB::table('model_has_roles')
            ->where('model_type', User::class)
            ->where('model_id', $target->id)
            ->pluck('role_id')
            ->toArray();

        // Sólo el rol nuevo, no acumulado con el viejo.
        $this->assertSame([$gerenteId], $roles);
        $this->assertNotContains($cajeroId, $roles);
        $this->assertSame(['gerente'], $target->fresh()->roles);
    }

    public function test_online_endpoint_returns_roles_without_crashing(): void
    {
        $admin = $this->makeUser('admin@test.com');
        $this->seedRole($admin, 'admin');

        $cajero = $this->makeUser('cajero@test.com');
        $this->seedRole($cajero, 'cajero');
        $cajero->update(['last_seen_at' => now()]);

        $this->actingAs($admin)
            ->getJson('/api/v1/users/online')
            ->assertOk()
            ->assertJsonFragment(['roles' => ['cajero']]);
    }

    private function makeUser(string $email): User
    {
        return User::create([
            'name' => $email,
            'email' => $email,
            'password' => bcrypt('password'),
            'company_id' => $this->company->id,
            'store_id' => $this->store->id,
            'active' => true,
        ]);
    }

    private function seedRole(User $user, string $roleName): int
    {
        $roleId = DB::table('roles')->insertGetId([
            'name' => $roleName,
            'guard_name' => 'api',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('model_has_roles')->insert([
            'role_id' => $roleId,
            'model_type' => User::class,
            'model_id' => $user->id,
        ]);

        return $roleId;
    }
}
