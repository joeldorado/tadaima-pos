<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Product;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Permiso delegado para ver el costo real de un producto.
 *
 * Bug QA Ruben 2026-05-27: cajero con `can_view_cost = true` no veía el costo,
 * porque ProductResource gateaba con `hasRole(admin) && can_view_cost`. Fix:
 * la regla pasa a `isAdmin || can_view_cost`, así el admin delegando el flag
 * a un gerente/cajero efectivamente le habilita la columna.
 */
class CostPermissionTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;
    private Store $store;
    private Product $product;

    protected function setUp(): void
    {
        parent::setUp();

        $this->company = Company::create(['name' => 'Tadaima Test']);
        $this->store = Store::create([
            'company_id' => $this->company->id,
            'name' => 'Tienda Centro',
            'active' => true,
        ]);
        $this->product = Product::create([
            'name' => 'One Piece Vol. 1',
            'sku' => 'OP-1',
            'cost' => 123.45,
            'active' => true,
            'product_type' => Product::TYPE_PRODUCT,
        ]);
    }

    public function test_admin_always_sees_product_cost(): void
    {
        $admin = $this->makeUser('admin@test.com', canViewCost: false);
        $this->assignRole($admin, 'admin');

        $this->actingAs($admin)
            ->getJson('/api/v1/products')
            ->assertOk()
            ->assertJsonPath('data.0.cost', 123.45);
    }

    public function test_cashier_without_flag_does_not_see_cost(): void
    {
        $cashier = $this->makeUser('cajero@test.com', canViewCost: false);
        $this->assignRole($cashier, 'cajero');

        $response = $this->actingAs($cashier)
            ->getJson('/api/v1/products')
            ->assertOk()
            ->json('data.0');

        $this->assertArrayNotHasKey('cost', $response,
            'Cajero sin can_view_cost no debe recibir el campo cost.');
    }

    public function test_cashier_with_flag_sees_cost(): void
    {
        $cashier = $this->makeUser('cajero@test.com', canViewCost: true);
        $this->assignRole($cashier, 'cajero');

        $this->actingAs($cashier)
            ->getJson('/api/v1/products')
            ->assertOk()
            ->assertJsonPath('data.0.cost', 123.45);
    }

    public function test_manager_with_flag_sees_cost(): void
    {
        $manager = $this->makeUser('gerente@test.com', canViewCost: true);
        $this->assignRole($manager, 'gerente');

        $this->actingAs($manager)
            ->getJson('/api/v1/products')
            ->assertOk()
            ->assertJsonPath('data.0.cost', 123.45);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private function makeUser(string $email, bool $canViewCost): User
    {
        return User::create([
            'name' => $email,
            'email' => $email,
            'password' => bcrypt('password'),
            'company_id' => $this->company->id,
            'store_id' => $this->store->id,
            'active' => true,
            'can_view_cost' => $canViewCost,
        ]);
    }

    private function assignRole(User $user, string $roleName): void
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
    }
}
