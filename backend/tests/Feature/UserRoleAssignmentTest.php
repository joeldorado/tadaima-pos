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

    /**
     * Perf 2026-08-05 (Joel): getRolesAttribute() es un accessor, no una
     * relación Eloquent — sin memoizar, CADA `$user->hasRole()`/`->roles`
     * volvía a pegarle a la BD. Serializar una página de N productos llama
     * a hasRole() por fila (ProductResource::canViewCost), multiplicando la
     * misma query N veces (era la mitad del tiempo de GET /products).
     */
    public function test_roles_accessor_is_memoized_within_the_same_instance(): void
    {
        $user = $this->makeUser('cajero2@test.com');
        $this->seedRole($user, 'cajero');

        DB::enableQueryLog();
        $user->hasRole('cajero');
        $user->hasRole('gerente');
        $user->hasRole(['admin', 'cajero']);
        $queries = DB::getQueryLog();
        DB::disableQueryLog();

        $rolesQueries = collect($queries)->filter(fn ($q) => str_contains($q['query'], 'model_has_roles'));
        $this->assertCount(1, $rolesQueries, 'getRolesAttribute() debe memoizar, no reconsultar en cada hasRole()');
    }

    /**
     * El caché es por INSTANCIA (una variable de instancia normal, no un
     * caché externo) — assignRole()/removeRole() devuelven `$user->fresh()`
     * a propósito para nunca arriesgar servir el estado de ANTES del
     * cambio. Este test documenta ambas mitades del contrato.
     */
    public function test_fresh_instance_bypasses_stale_roles_cache(): void
    {
        $user = $this->makeUser('cajero3@test.com');
        $this->seedRole($user, 'cajero');

        // Fuerza el caché con el estado ANTES del cambio.
        $this->assertTrue($user->hasRole('cajero'));

        // Cambia el rol por fuera del modelo (lo mismo que hacen assignRole/removeRole).
        DB::table('model_has_roles')->where('model_id', $user->id)->where('model_type', User::class)->delete();
        $gerenteId = DB::table('roles')->insertGetId([
            'name' => 'gerente', 'guard_name' => 'api', 'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('model_has_roles')->insert(['role_id' => $gerenteId, 'model_type' => User::class, 'model_id' => $user->id]);

        // La instancia original mantiene su caché — comportamiento esperado.
        $this->assertTrue($user->hasRole('cajero'));

        // ->fresh() (el patrón real usado en los endpoints) ve el estado real.
        $this->assertTrue($user->fresh()->hasRole('gerente'));
        $this->assertFalse($user->fresh()->hasRole('cajero'));
    }

    public function test_remove_role_http_returns_updated_roles_not_stale(): void
    {
        $admin = $this->makeUser('admin2@test.com');
        $this->seedRole($admin, 'admin');

        $target = $this->makeUser('cajero4@test.com');
        $roleId = $this->seedRole($target, 'cajero');

        $resp = $this->actingAs($admin)
            ->deleteJson("/api/v1/users/{$target->id}/roles/{$roleId}")
            ->assertOk()
            ->json('data');

        $this->assertSame([], $resp['roles']);
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
