<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Anti-escalada en gestión de usuarios (2026-06-27). El cambio de Rubén abrió
 * a los gerentes la gestión de usuarios de su tienda; el backend store() y
 * assignRole() no tenían gate → un no-admin podía crear/promover a ADMIN por
 * API directa. Ahora: admin libre; gerente solo su tienda y NUNCA rol admin;
 * cajero no crea usuarios.
 */
class UserManagementEscalationTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;
    private Store $storeA;
    private Store $storeB;
    private User $admin;
    private User $gerenteA;
    private User $cajeroA;
    private int $adminRoleId;
    private int $cajeroRoleId;

    protected function setUp(): void
    {
        parent::setUp();

        $this->company = Company::create(['name' => 'Tadaima Test']);
        $this->storeA = Store::create(['company_id' => $this->company->id, 'name' => 'Tienda A', 'active' => true]);
        $this->storeB = Store::create(['company_id' => $this->company->id, 'name' => 'Tienda B', 'active' => true]);

        $this->adminRoleId = $this->roleId('admin');
        $this->cajeroRoleId = $this->roleId('cajero');
        $this->roleId('gerente');

        $this->admin = $this->makeUser('admin@test.com', 'admin', null);
        $this->gerenteA = $this->makeUser('gerente.a@test.com', 'gerente', $this->storeA->id);
        $this->cajeroA = $this->makeUser('cajero.a@test.com', 'cajero', $this->storeA->id);
    }

    // ── store() ───────────────────────────────────────────────────────────────

    public function test_gerente_no_puede_crear_un_admin(): void
    {
        $this->actingAs($this->gerenteA)
            ->postJson('/api/v1/users', [
                'name' => 'Hacker', 'email' => 'hacker@test.com', 'password' => 'password123',
                'store_id' => $this->storeA->id, 'role_id' => $this->adminRoleId,
            ])
            ->assertForbidden();

        $this->assertDatabaseMissing('users', ['email' => 'hacker@test.com']);
    }

    public function test_gerente_crea_cajero_de_su_tienda(): void
    {
        $this->actingAs($this->gerenteA)
            ->postJson('/api/v1/users', [
                'name' => 'Nuevo Cajero', 'email' => 'cajero.nuevo@test.com', 'password' => 'password123',
                'store_id' => $this->storeA->id, 'role_id' => $this->cajeroRoleId,
            ])
            ->assertCreated();
    }

    public function test_gerente_no_crea_usuario_de_otra_tienda(): void
    {
        $this->actingAs($this->gerenteA)
            ->postJson('/api/v1/users', [
                'name' => 'Ajeno', 'email' => 'ajeno@test.com', 'password' => 'password123',
                'store_id' => $this->storeB->id, 'role_id' => $this->cajeroRoleId,
            ])
            ->assertForbidden();
    }

    public function test_cajero_no_puede_crear_usuarios(): void
    {
        $this->actingAs($this->cajeroA)
            ->postJson('/api/v1/users', [
                'name' => 'X', 'email' => 'x@test.com', 'password' => 'password123',
                'store_id' => $this->storeA->id, 'role_id' => $this->cajeroRoleId,
            ])
            ->assertForbidden();
    }

    public function test_admin_si_puede_crear_admin(): void
    {
        $this->actingAs($this->admin)
            ->postJson('/api/v1/users', [
                'name' => 'Otro Admin', 'email' => 'admin2@test.com', 'password' => 'password123',
                'role_id' => $this->adminRoleId,
            ])
            ->assertCreated();
    }

    // ── assignRole() ────────────────────────────────────────────────────────────

    public function test_gerente_no_puede_promover_a_admin(): void
    {
        $target = $this->makeUser('target@test.com', 'cajero', $this->storeA->id);

        $this->actingAs($this->gerenteA)
            ->postJson("/api/v1/users/{$target->id}/roles", ['role_id' => $this->adminRoleId])
            ->assertForbidden();
    }

    public function test_gerente_cambia_rol_de_cajero_de_su_tienda(): void
    {
        $target = $this->makeUser('target2@test.com', 'cajero', $this->storeA->id);

        $this->actingAs($this->gerenteA)
            ->postJson("/api/v1/users/{$target->id}/roles", ['role_id' => $this->roleId('gerente')])
            ->assertOk();
    }

    public function test_gerente_no_cambia_rol_de_otra_tienda(): void
    {
        $target = $this->makeUser('targetB@test.com', 'cajero', $this->storeB->id);

        $this->actingAs($this->gerenteA)
            ->postJson("/api/v1/users/{$target->id}/roles", ['role_id' => $this->cajeroRoleId])
            ->assertForbidden();
    }

    // ── Helpers ─────────────────────────────────────────────────────────────────

    private function roleId(string $name): int
    {
        return DB::table('roles')->where('name', $name)->value('id')
            ?? DB::table('roles')->insertGetId([
                'name' => $name, 'guard_name' => 'api',
                'created_at' => now(), 'updated_at' => now(),
            ]);
    }

    private function makeUser(string $email, string $roleName, ?int $storeId): User
    {
        $user = User::create([
            'name' => $email, 'email' => $email, 'password' => bcrypt('password'),
            'company_id' => $this->company->id, 'store_id' => $storeId, 'active' => true,
        ]);

        DB::table('model_has_roles')->insert([
            'role_id' => $this->roleId($roleName), 'model_type' => User::class, 'model_id' => $user->id,
        ]);

        return $user;
    }
}
