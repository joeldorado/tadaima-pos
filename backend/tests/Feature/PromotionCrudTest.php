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
 * CRUD de promociones NxM (Fase 3): validaciones (pay_m < buy_n), RBAC
 * (mutar = admin/gerente), pausar/reanudar, y expiración lazy honesta.
 */
class PromotionCrudTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $cashier;
    private Product $product;

    protected function setUp(): void
    {
        parent::setUp();

        $company = Company::create(['name' => 'Test Co']);
        $store = Store::create(['company_id' => $company->id, 'name' => 'Test Store']);

        $this->admin = User::create([
            'name' => 'Admin', 'email' => 'admin@test.com', 'password' => bcrypt('x'),
            'company_id' => $company->id, 'store_id' => $store->id,
        ]);
        $this->assignRole($this->admin, 'admin');

        $this->cashier = User::create([
            'name' => 'Cajero', 'email' => 'cajero@test.com', 'password' => bcrypt('x'),
            'company_id' => $company->id, 'store_id' => $store->id,
        ]);
        $this->assignRole($this->cashier, 'cajero');

        $this->product = Product::create([
            'company_id' => $company->id, 'name' => 'Funko', 'sku' => 'FUN-1', 'active' => true,
        ]);
    }

    private function assignRole(User $user, string $role): void
    {
        $roleId = DB::table('roles')->where('name', $role)->value('id')
            ?? DB::table('roles')->insertGetId(['name' => $role, 'created_at' => now(), 'updated_at' => now()]);
        DB::table('model_has_roles')->insert([
            'role_id' => $roleId, 'model_type' => User::class, 'model_id' => $user->id,
        ]);
    }

    public function test_admin_creates_promo_and_it_appears_in_product_payload(): void
    {
        $this->actingAs($this->admin)
            ->postJson("/api/v1/products/{$this->product->id}/promotions", [
                'name' => '2x1 Verano', 'buy_n' => 2, 'pay_m' => 1,
            ])
            ->assertStatus(201)
            ->assertJsonPath('data.name', '2x1 Verano');

        // La promo vigente viaja en el payload del producto (motor de Caja).
        $this->actingAs($this->admin)
            ->getJson("/api/v1/products/{$this->product->id}")
            ->assertStatus(200)
            ->assertJsonPath('data.active_promotions.0.name', '2x1 Verano')
            ->assertJsonPath('data.active_promotions.0.buy_n', 2)
            ->assertJsonPath('data.active_promotions.0.pay_m', 1);
    }

    public function test_pay_m_must_be_less_than_buy_n(): void
    {
        $this->actingAs($this->admin)
            ->postJson("/api/v1/products/{$this->product->id}/promotions", [
                'name' => 'Inválida', 'buy_n' => 2, 'pay_m' => 2,
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['pay_m']);
    }

    public function test_cashier_cannot_mutate_but_can_list(): void
    {
        $promo = ProductPromotion::create([
            'product_id' => $this->product->id, 'name' => '2x1', 'buy_n' => 2, 'pay_m' => 1,
        ]);

        $this->actingAs($this->cashier)
            ->postJson("/api/v1/products/{$this->product->id}/promotions", [
                'name' => 'Hack', 'buy_n' => 2, 'pay_m' => 1,
            ])->assertStatus(403);

        $this->actingAs($this->cashier)
            ->putJson("/api/v1/products/{$this->product->id}/promotions/{$promo->id}", [
                'name' => '2x1', 'buy_n' => 2, 'pay_m' => 1, 'status' => 'paused',
            ])->assertStatus(403);

        $this->actingAs($this->cashier)
            ->deleteJson("/api/v1/products/{$this->product->id}/promotions/{$promo->id}")
            ->assertStatus(403);

        $this->actingAs($this->cashier)
            ->getJson("/api/v1/products/{$this->product->id}/promotions")
            ->assertStatus(200)
            ->assertJsonCount(1, 'data');
    }

    public function test_pause_and_resume(): void
    {
        $promo = ProductPromotion::create([
            'product_id' => $this->product->id, 'name' => '2x1', 'buy_n' => 2, 'pay_m' => 1,
        ]);

        $this->actingAs($this->admin)
            ->putJson("/api/v1/products/{$this->product->id}/promotions/{$promo->id}", [
                'name' => '2x1', 'buy_n' => 2, 'pay_m' => 1, 'status' => 'paused',
            ])->assertStatus(200)->assertJsonPath('data.status', 'paused');

        // Pausada NO viaja en active_promotions.
        $this->actingAs($this->admin)
            ->getJson("/api/v1/products/{$this->product->id}")
            ->assertJsonCount(0, 'data.active_promotions');

        $this->actingAs($this->admin)
            ->putJson("/api/v1/products/{$this->product->id}/promotions/{$promo->id}", [
                'name' => '2x1', 'buy_n' => 2, 'pay_m' => 1, 'status' => 'active',
            ])->assertStatus(200)->assertJsonPath('data.status', 'active');

        $this->actingAs($this->admin)
            ->getJson("/api/v1/products/{$this->product->id}")
            ->assertJsonCount(1, 'data.active_promotions');
    }

    public function test_lazy_expiration_marks_status_on_admin_list(): void
    {
        ProductPromotion::create([
            'product_id' => $this->product->id, 'name' => 'Navidad', 'buy_n' => 2, 'pay_m' => 1,
            'ends_at' => now()->subDay(),
        ]);

        // El listado admin marca honesto el estado (lazy, sin cron)…
        $this->actingAs($this->admin)
            ->getJson("/api/v1/products/{$this->product->id}/promotions")
            ->assertStatus(200)
            ->assertJsonPath('data.0.status', 'expired');

        // …y nunca viaja como vigente al motor de Caja.
        $this->actingAs($this->admin)
            ->getJson("/api/v1/products/{$this->product->id}")
            ->assertJsonCount(0, 'data.active_promotions');
    }

    public function test_vigency_dates_anchor_to_business_timezone(): void
    {
        // El admin captura "vence 2026-07-20". A las 22:00 de Tijuana del día
        // 20 (= 05:00 UTC del 21) la promo DEBE seguir vigente. Sin la
        // conversión a TZ del negocio, ends_at quedaba 23:59:59 UTC (~5pm
        // local) y la promo moría temprano (hallazgo review Fase 3).
        $this->actingAs($this->admin)
            ->postJson("/api/v1/products/{$this->product->id}/promotions", [
                'name' => 'Vence el 20', 'buy_n' => 2, 'pay_m' => 1,
                'starts_at' => '2026-07-18', 'ends_at' => '2026-07-20',
            ])->assertStatus(201);

        // 22:00 Tijuana del 20 de julio (UTC-7 en verano) = 2026-07-21 05:00 UTC.
        \Carbon\Carbon::setTestNow('2026-07-21 05:00:00');
        $this->assertSame(1, \App\Models\ProductPromotion::currentlyActive()->count(),
            'La promo debe seguir viva a las 22:00 Tijuana de su último día');

        // 00:30 Tijuana del 21 (= 07:30 UTC del 21) → ya vencida.
        \Carbon\Carbon::setTestNow('2026-07-21 07:30:00');
        $this->assertSame(0, \App\Models\ProductPromotion::currentlyActive()->count(),
            'La promo debe morir pasada la medianoche de Tijuana');

        // Y arranca al inicio del día LOCAL del 18 (07:00 UTC), no antes.
        \Carbon\Carbon::setTestNow('2026-07-18 06:00:00'); // 23:00 del 17 en Tijuana
        $this->assertSame(0, \App\Models\ProductPromotion::currentlyActive()->count());
        \Carbon\Carbon::setTestNow('2026-07-18 08:00:00'); // 01:00 del 18 en Tijuana
        $this->assertSame(1, \App\Models\ProductPromotion::currentlyActive()->count());

        \Carbon\Carbon::setTestNow();
    }

    public function test_promotion_of_another_product_is_404(): void
    {
        $other = Product::create([
            'company_id' => $this->product->company_id, 'name' => 'Otro', 'sku' => 'OTR-1', 'active' => true,
        ]);
        $promo = ProductPromotion::create([
            'product_id' => $other->id, 'name' => '2x1', 'buy_n' => 2, 'pay_m' => 1,
        ]);

        $this->actingAs($this->admin)
            ->putJson("/api/v1/products/{$this->product->id}/promotions/{$promo->id}", [
                'name' => 'X', 'buy_n' => 2, 'pay_m' => 1,
            ])->assertStatus(404);
    }
}
