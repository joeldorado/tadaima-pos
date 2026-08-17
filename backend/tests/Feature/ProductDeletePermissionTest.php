<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Product;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Regla (Joel 2026-08-17): eliminar productos/tomos = quien puede ver el
 * costo real (admin siempre; gerente solo con can_view_cost). Antes el UI lo
 * dejaba solo al admin y el API a cualquier gerente. El borrado TOTAL
 * (/force, mata historial de ventas) sigue siendo solo admin.
 */
class ProductDeletePermissionTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;

    private Store $store;

    private User $admin;

    private User $gerenteConCosto;

    private User $gerenteSinCosto;

    protected function setUp(): void
    {
        parent::setUp();

        $this->company = Company::create(['name' => 'Tadaima Test']);
        $this->store = Store::create(['company_id' => $this->company->id, 'name' => 'Tienda A', 'active' => true]);

        $this->admin = $this->makeUser('admin@test.com', 'admin', false);
        $this->gerenteConCosto = $this->makeUser('gerente.costo@test.com', 'gerente', true);
        $this->gerenteSinCosto = $this->makeUser('gerente.nocosto@test.com', 'gerente', false);
    }

    private function makeUser(string $email, string $roleName, bool $canViewCost): User
    {
        $user = User::create([
            'name' => $email, 'email' => $email, 'password' => bcrypt('password'),
            'company_id' => $this->company->id, 'store_id' => $this->store->id,
            'active' => true, 'can_view_cost' => $canViewCost,
        ]);
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

    private function makeProduct(string $type = Product::TYPE_PRODUCT): Product
    {
        return Product::create([
            'name' => 'Borrable '.uniqid(), 'sku' => 'DEL-'.uniqid(), 'active' => true,
            'product_type' => $type,
        ]);
    }

    public function test_gerente_sin_permiso_de_costo_no_puede_eliminar_producto_ni_tomo(): void
    {
        $product = $this->makeProduct();
        $manga = $this->makeProduct(Product::TYPE_MANGA);

        $this->actingAs($this->gerenteSinCosto)
            ->deleteJson("/api/v1/products/{$product->id}")
            ->assertForbidden();
        $this->actingAs($this->gerenteSinCosto)
            ->deleteJson("/api/v1/mangas/{$manga->id}")
            ->assertForbidden();

        $this->assertDatabaseHas('products', ['id' => $product->id]);
        $this->assertDatabaseHas('products', ['id' => $manga->id]);
    }

    public function test_gerente_con_permiso_de_costo_si_elimina_producto_y_tomo(): void
    {
        $product = $this->makeProduct();
        $manga = $this->makeProduct(Product::TYPE_MANGA);

        $this->actingAs($this->gerenteConCosto)
            ->deleteJson("/api/v1/products/{$product->id}")
            ->assertOk();
        $this->actingAs($this->gerenteConCosto)
            ->deleteJson("/api/v1/mangas/{$manga->id}")
            ->assertOk();

        $this->assertDatabaseMissing('products', ['id' => $product->id]);
        $this->assertDatabaseMissing('products', ['id' => $manga->id]);
    }

    public function test_borrado_total_force_sigue_siendo_solo_admin(): void
    {
        $product = $this->makeProduct();

        $this->actingAs($this->gerenteConCosto)
            ->deleteJson("/api/v1/products/{$product->id}/force")
            ->assertForbidden();
        $this->assertDatabaseHas('products', ['id' => $product->id]);

        $this->actingAs($this->admin)
            ->deleteJson("/api/v1/products/{$product->id}/force")
            ->assertOk();
        $this->assertDatabaseMissing('products', ['id' => $product->id]);
    }

    public function test_admin_sigue_eliminando_sin_flag(): void
    {
        $product = $this->makeProduct();

        $this->actingAs($this->admin)
            ->deleteJson("/api/v1/products/{$product->id}")
            ->assertOk();
    }
}
