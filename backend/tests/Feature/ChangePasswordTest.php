<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

/**
 * Cambio de contraseña self-service (POST /auth/password) + cierre del hueco
 * RBAC en PUT /users/{user}.
 *
 * Hallazgo de seguridad 2026-06-19: UpdateUserRequest::authorize() devolvía
 * true sin guard → cualquier usuario autenticado podía cambiarle la contraseña
 * a CUALQUIER otro (toma de cuenta con un token robado).
 */
class ChangePasswordTest extends TestCase
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

    public function test_user_can_change_own_password_with_correct_current_password(): void
    {
        $user = $this->makeUser('cajero@test.com', 'OldPass123');

        $this->actingAs($user)
            ->postJson('/api/v1/auth/password', [
                'current_password' => 'OldPass123',
                'password'         => 'NewPass456',
            ])
            ->assertOk();

        $this->assertTrue(Hash::check('NewPass456', $user->fresh()->password));
    }

    public function test_change_password_rejects_wrong_current_password(): void
    {
        $user = $this->makeUser('cajero@test.com', 'OldPass123');

        $this->actingAs($user)
            ->postJson('/api/v1/auth/password', [
                'current_password' => 'WrongPass',
                'password'         => 'NewPass456',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('current_password');

        $this->assertTrue(Hash::check('OldPass123', $user->fresh()->password));
    }

    public function test_change_password_rejects_short_or_same_password(): void
    {
        $user = $this->makeUser('cajero@test.com', 'OldPass123');

        $this->actingAs($user)
            ->postJson('/api/v1/auth/password', [
                'current_password' => 'OldPass123',
                'password'         => 'short',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('password');

        $this->actingAs($user)
            ->postJson('/api/v1/auth/password', [
                'current_password' => 'OldPass123',
                'password'         => 'OldPass123',
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors('password');
    }

    public function test_non_admin_cannot_change_another_users_password_via_users_endpoint(): void
    {
        $attacker = $this->makeUser('cajero@test.com', 'AttackerPass');
        $this->seedRole($attacker, 'cajero');

        $victim = $this->makeUser('victima@test.com', 'VictimPass');

        $this->actingAs($attacker)
            ->putJson("/api/v1/users/{$victim->id}", ['password' => 'Hacked12345'])
            ->assertStatus(403);

        // La contraseña de la víctima NO cambió.
        $this->assertTrue(Hash::check('VictimPass', $victim->fresh()->password));
    }

    public function test_admin_can_still_reset_another_users_password(): void
    {
        $admin = $this->makeUser('admin@test.com', 'AdminPass');
        $this->seedRole($admin, 'admin');

        $victim = $this->makeUser('user@test.com', 'OldPass');

        $this->actingAs($admin)
            ->putJson("/api/v1/users/{$victim->id}", ['password' => 'ResetByAdmin1'])
            ->assertOk();

        $this->assertTrue(Hash::check('ResetByAdmin1', $victim->fresh()->password));
    }

    private function makeUser(string $email, string $password): User
    {
        return User::create([
            'name' => $email,
            'email' => $email,
            'password' => Hash::make($password),
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
