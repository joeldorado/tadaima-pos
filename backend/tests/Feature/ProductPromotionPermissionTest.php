<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Product;
use App\Models\ProductPromotion;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Permiso por usuario "Gestionar Promociones" (can_manage_promos, 2026-07-18):
 * default TRUE (los gerentes crean promos tal como siempre); el admin lo
 * REVOCA por usuario en Permisos y ese gerente pierde crear/editar/borrar.
 * El rol sigue siendo requisito: cajero con flag true sigue 403.
 */
class ProductPromotionPermissionTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;
    private Store $store;
    private Product $product;
    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->company = Company::create(['name' => 'Test Co']);
        $this->store = Store::create(['company_id' => $this->company->id, 'name' => 'Tienda A']);
        $this->admin = $this->makeUser('admin@test.com', 'admin');
        $this->product = Product::create([
            'company_id' => $this->company->id, 'name' => 'Producto', 'sku' => 'SKU-1', 'cost' => 10, 'active' => true,
        ]);
    }

    private function makeUser(string $email, string $role, bool $canManagePromos = true): User
    {
        $user = User::create([
            'name' => $email, 'email' => $email, 'password' => bcrypt('x'),
            'company_id' => $this->company->id, 'store_id' => $this->store->id,
            'can_manage_promos' => $canManagePromos,
        ]);
        $roleId = DB::table('roles')->where('name', $role)->value('id')
            ?? DB::table('roles')->insertGetId(['name' => $role, 'created_at' => now(), 'updated_at' => now()]);
        DB::table('model_has_roles')->insert([
            'role_id' => $roleId, 'model_type' => User::class, 'model_id' => $user->id,
        ]);

        return $user;
    }

    private function promoPayload(array $extra = []): array
    {
        return array_merge([
            'name' => 'Promo Test', 'buy_n' => 2, 'pay_m' => 1, 'priority' => 0,
            'store_id' => $this->store->id,
        ], $extra);
    }

    public function test_gerente_default_puede_crear_promo(): void
    {
        // "Tal como funciona ahorita": sin tocar nada, el gerente crea promos.
        $gerente = $this->makeUser('gerente@test.com', 'gerente');

        $this->actingAs($gerente)
            ->postJson("/api/v1/products/{$this->product->id}/promotions", $this->promoPayload())
            ->assertStatus(201);
    }

    public function test_gerente_sin_flag_no_puede_crear_editar_ni_borrar(): void
    {
        $gerente = $this->makeUser('gerente2@test.com', 'gerente', canManagePromos: false);

        $this->actingAs($gerente)
            ->postJson("/api/v1/products/{$this->product->id}/promotions", $this->promoPayload())
            ->assertStatus(403);

        $promo = ProductPromotion::create([
            'product_id' => $this->product->id, 'store_id' => $this->store->id,
            'name' => 'Existente', 'buy_n' => 2, 'pay_m' => 1, 'status' => 'active', 'priority' => 0,
        ]);

        $this->actingAs($gerente)
            ->putJson("/api/v1/products/{$this->product->id}/promotions/{$promo->id}", $this->promoPayload(['status' => 'paused']))
            ->assertStatus(403);

        $this->actingAs($gerente)
            ->deleteJson("/api/v1/products/{$this->product->id}/promotions/{$promo->id}")
            ->assertStatus(403);
    }

    public function test_admin_revoca_flag_via_permisos_y_siempre_puede_el_mismo(): void
    {
        $gerente = $this->makeUser('gerente3@test.com', 'gerente');

        // El admin apaga el flag por PUT /users (lo que hace TabPermisos).
        $this->actingAs($this->admin)
            ->putJson("/api/v1/users/{$gerente->id}", ['can_manage_promos' => false])
            ->assertOk()
            ->assertJsonPath('data.can_manage_promos', false);

        $this->actingAs($gerente->fresh())
            ->postJson("/api/v1/products/{$this->product->id}/promotions", $this->promoPayload())
            ->assertStatus(403);

        // Admin con su PROPIO flag apagado sigue pudiendo (admin siempre).
        $this->admin->update(['can_manage_promos' => false]);
        $this->actingAs($this->admin->fresh())
            ->postJson("/api/v1/products/{$this->product->id}/promotions", $this->promoPayload(['store_id' => null]))
            ->assertStatus(201);
    }

    public function test_cajero_sigue_bloqueado_por_rol_aunque_tenga_flag(): void
    {
        $cajero = $this->makeUser('cajero@test.com', 'cajero', canManagePromos: true);

        $this->actingAs($cajero)
            ->postJson("/api/v1/products/{$this->product->id}/promotions", $this->promoPayload())
            ->assertStatus(403);
    }

    public function test_no_admin_no_puede_escribir_el_flag(): void
    {
        $gerente = $this->makeUser('gerente4@test.com', 'gerente');
        $otro = $this->makeUser('gerente5@test.com', 'gerente');

        // Un no-admin editando usuarios solo toca campos básicos: el flag NO cambia.
        $this->actingAs($gerente)
            ->putJson("/api/v1/users/{$otro->id}", ['name' => $otro->name, 'can_manage_promos' => false]);

        $this->assertTrue((bool) $otro->fresh()->can_manage_promos, 'El flag no debe cambiar por un no-admin');
    }
}
