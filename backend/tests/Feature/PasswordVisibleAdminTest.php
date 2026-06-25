<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Company;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Feedback cliente 2026-06-24: el admin puede VER el password de los demás en
 * users settings. Se guarda una copia reversible (`password_enc`, cast
 * 'encrypted' con la APP_KEY) y `UserResource` la expone como `password_plain`
 * SOLO al admin. El login sigue usando el bcrypt de `password`.
 */
class PasswordVisibleAdminTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;
    private User $admin;
    private int $cajeroRoleId;

    protected function setUp(): void
    {
        parent::setUp();

        $this->company = Company::create(['name' => 'Tadaima Test']);
        $this->admin = User::create([
            'name' => 'Admin', 'email' => 'admin@test.com', 'password' => bcrypt('password'),
            'company_id' => $this->company->id, 'active' => true,
        ]);
        $adminRoleId = $this->makeRole('admin');
        DB::table('model_has_roles')->insert([
            'role_id' => $adminRoleId, 'model_type' => User::class, 'model_id' => $this->admin->id,
        ]);
        $this->cajeroRoleId = $this->makeRole('cajero');
    }

    public function test_created_user_stores_encrypted_password_and_admin_sees_plaintext(): void
    {
        $id = $this->actingAs($this->admin)
            ->postJson('/api/v1/users', [
                'name' => 'Cajero', 'email' => 'cajero@test.com',
                'password' => 'Secreta123', 'active' => true,
                'role_id' => $this->cajeroRoleId,
            ])
            ->assertCreated()
            ->json('data.id');

        // El admin ve el password en claro vía GET /users/{id}.
        $plain = $this->actingAs($this->admin)
            ->getJson("/api/v1/users/{$id}")
            ->assertOk()
            ->json('data.password_plain');
        $this->assertSame('Secreta123', $plain);

        // El bcrypt de `password` sigue siendo la fuente de verdad del login
        // (la copia encriptada es solo para consulta del admin).
        $this->assertTrue(\Illuminate\Support\Facades\Hash::check('Secreta123', User::find($id)->password));
    }

    public function test_non_admin_never_receives_password_plain(): void
    {
        $cajero = User::create([
            'name' => 'Cajero', 'email' => 'c@test.com', 'password' => 'pw',
            'company_id' => $this->company->id, 'active' => true,
        ]);
        DB::table('model_has_roles')->insert([
            'role_id' => $this->cajeroRoleId, 'model_type' => User::class, 'model_id' => $cajero->id,
        ]);

        // El cajero (no-admin) NO debe recibir password_plain ni de sí mismo.
        $json = $this->actingAs($cajero)
            ->getJson("/api/v1/users/{$cajero->id}")
            ->assertOk()
            ->json('data');
        $this->assertArrayNotHasKey('password_plain', $json);
    }

    public function test_user_without_encrypted_copy_returns_null_for_admin(): void
    {
        // Usuario creado directo (como los previos al cambio) → sin password_enc.
        $legacy = User::create([
            'name' => 'Legacy', 'email' => 'legacy@test.com', 'password' => bcrypt('x'),
            'company_id' => $this->company->id, 'active' => true,
        ]);

        $json = $this->actingAs($this->admin)
            ->getJson("/api/v1/users/{$legacy->id}")
            ->assertOk()
            ->json('data');
        $this->assertArrayHasKey('password_plain', $json);
        $this->assertNull($json['password_plain'], 'Sin copia encriptada → null (resetear para capturar)');
    }

    private function makeRole(string $name): int
    {
        return DB::table('roles')->insertGetId([
            'name' => $name, 'guard_name' => 'api',
            'created_at' => now(), 'updated_at' => now(),
        ]);
    }
}
