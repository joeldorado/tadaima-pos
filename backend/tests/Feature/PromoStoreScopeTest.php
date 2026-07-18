<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\CashRegister;
use App\Models\CashRegisterSession;
use App\Models\Company;
use App\Models\Inventory;
use App\Models\PaymentMethod;
use App\Models\Product;
use App\Models\ProductPromotion;
use App\Models\Store;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Scoping por tienda de promos NxM (2026-07-16): store_id NULL = todas las
 * tiendas; con valor = solo esa sucursal. El checkout solo aplica promos de la
 * tienda de la venta (o globales).
 */
class PromoStoreScopeTest extends TestCase
{
    use RefreshDatabase;

    private User $user;
    private Store $storeA;
    private Store $storeB;
    private CashRegisterSession $session;
    private PaymentMethod $cashMethod;
    private Product $product;

    protected function setUp(): void
    {
        parent::setUp();

        $company = Company::create(['name' => 'Test Co']);
        $this->storeA = Store::create(['company_id' => $company->id, 'name' => 'Tienda A']);
        $this->storeB = Store::create(['company_id' => $company->id, 'name' => 'Tienda B']);
        $this->user = User::create([
            'name' => 'Cajero', 'email' => 'cajero@test.com', 'password' => bcrypt('x'),
            'company_id' => $company->id, 'store_id' => $this->storeA->id,
        ]);
        $warehouse = Warehouse::create([
            'company_id' => $company->id, 'store_id' => $this->storeA->id,
            'name' => 'Exhibición', 'type' => 'store', 'active' => true,
        ]);
        $register = CashRegister::create(['store_id' => $this->storeA->id, 'name' => 'Caja 1', 'active' => true]);
        $this->session = CashRegisterSession::create([
            'register_id' => $register->id, 'user_id' => $this->user->id,
            'opening_cash' => 0, 'status' => 'open', 'opened_at' => now(),
        ]);
        $this->cashMethod = PaymentMethod::firstOrCreate(['name' => 'Efectivo'], ['active' => true]);

        $this->product = Product::create([
            'company_id' => $company->id, 'name' => 'Producto Promo', 'sku' => 'SKU-PROMO', 'cost' => 50, 'active' => true,
        ]);
        $this->product->price()->create(['price_1' => 100.0]);
        Inventory::create(['product_id' => $this->product->id, 'warehouse_id' => $warehouse->id, 'quantity' => 100]);
    }

    private function checkout(float $payment): \Illuminate\Testing\TestResponse
    {
        return $this->actingAs($this->user)->postJson('/api/v1/sales', [
            'store_id'            => $this->storeA->id,
            'register_session_id' => $this->session->id,
            'calc_version'        => 2,
            'items'               => [['product_id' => $this->product->id, 'quantity' => 2, 'price' => 100.0]],
            'payments'            => [['payment_method_id' => $this->cashMethod->id, 'amount' => $payment]],
        ]);
    }

    private function makePromo(?int $storeId): ProductPromotion
    {
        return ProductPromotion::create([
            'product_id' => $this->product->id, 'store_id' => $storeId,
            'name' => '2x1 Test', 'buy_n' => 2, 'pay_m' => 1, 'status' => 'active', 'priority' => 0,
        ]);
    }

    public function test_global_promo_applies_in_any_store(): void
    {
        $this->makePromo(null);

        // 2×$100 con 2x1 → paga $100.
        $this->checkout(100.0)->assertStatus(201)->assertJsonPath('data.total', 100);
    }

    public function test_same_store_promo_applies(): void
    {
        $this->makePromo($this->storeA->id);

        $this->checkout(100.0)->assertStatus(201)->assertJsonPath('data.total', 100);
    }

    public function test_other_store_promo_does_not_apply(): void
    {
        $this->makePromo($this->storeB->id);

        // La promo es de la tienda B → en tienda A se cobra completo ($200).
        $this->checkout(200.0)->assertStatus(201)->assertJsonPath('data.total', 200);
    }

    private function makeManager(Store $store): User
    {
        $manager = User::create([
            'name' => "Gerente {$store->name}", 'email' => "gerente{$store->id}@test.com", 'password' => bcrypt('x'),
            'company_id' => $store->company_id, 'store_id' => $store->id,
        ]);
        $roleId = \Illuminate\Support\Facades\DB::table('roles')->where('name', 'gerente')->value('id')
            ?? \Illuminate\Support\Facades\DB::table('roles')->insertGetId(['name' => 'gerente', 'created_at' => now(), 'updated_at' => now()]);
        \Illuminate\Support\Facades\DB::table('model_has_roles')->insert([
            'role_id' => $roleId, 'model_type' => User::class, 'model_id' => $manager->id,
        ]);

        return $manager;
    }

    public function test_manager_cannot_mutate_other_store_or_global_promos(): void
    {
        $managerA = $this->makeManager($this->storeA);
        $globalPromo = $this->makePromo(null);
        $storeBPromo = $this->makePromo($this->storeB->id);

        // Ni la global ni la de otra tienda se pueden borrar/editar.
        $this->actingAs($managerA)
            ->deleteJson("/api/v1/products/{$this->product->id}/promotions/{$globalPromo->id}")
            ->assertStatus(403);
        $this->actingAs($managerA)
            ->deleteJson("/api/v1/products/{$this->product->id}/promotions/{$storeBPromo->id}")
            ->assertStatus(403);

        // La de SU tienda sí.
        $ownPromo = $this->makePromo($this->storeA->id);
        $this->actingAs($managerA)
            ->deleteJson("/api/v1/products/{$this->product->id}/promotions/{$ownPromo->id}")
            ->assertOk();
    }

    public function test_max_two_active_promos_per_product(): void
    {
        $manager = $this->makeManager($this->storeA);
        $this->makePromo($this->storeA->id);
        $this->makePromo($this->storeA->id);

        $payload = ['name' => 'Tercera', 'buy_n' => 3, 'pay_m' => 2, 'priority' => 0, 'store_id' => $this->storeA->id];

        // Con 2 activas, crear una tercera ACTIVA → 422.
        $this->actingAs($manager)
            ->postJson("/api/v1/products/{$this->product->id}/promotions", $payload)
            ->assertStatus(422);

        // Crearla PAUSADA sí se permite…
        $resp = $this->actingAs($manager)
            ->postJson("/api/v1/products/{$this->product->id}/promotions", array_merge($payload, ['status' => 'paused']))
            ->assertStatus(201);
        $pausedId = (int) $resp->json('data.id');

        // …pero reactivarla con las otras 2 vivas → 422.
        $this->actingAs($manager)
            ->putJson("/api/v1/products/{$this->product->id}/promotions/{$pausedId}", array_merge($payload, ['status' => 'active']))
            ->assertStatus(422);

        // Pausando una de las 2, la reactivación ya pasa.
        ProductPromotion::query()->where('name', '2x1 Test')->orderBy('id')->first()?->update(['status' => 'paused']);
        $this->actingAs($manager)
            ->putJson("/api/v1/products/{$this->product->id}/promotions/{$pausedId}", array_merge($payload, ['status' => 'active']))
            ->assertOk();
    }

    public function test_duplicate_nxm_with_overlapping_window_rejected(): void
    {
        $manager = $this->makeManager($this->storeA);

        // Promo A: 2x1 storeA con ventana hoy → +5 días.
        ProductPromotion::create([
            'product_id' => $this->product->id, 'store_id' => $this->storeA->id,
            'name' => 'Verano', 'buy_n' => 2, 'pay_m' => 1, 'status' => 'active', 'priority' => 0,
            'starts_at' => now()->startOfDay(), 'ends_at' => now()->addDays(5)->endOfDay(),
        ]);

        $base = ['buy_n' => 2, 'pay_m' => 1, 'priority' => 0, 'store_id' => $this->storeA->id];
        $d = fn (int $days) => now()->addDays($days)->toDateString();

        // Mismo 2x1 con fechas ENCIMADAS (otro nombre) → 422 nombrando a la existente.
        $resp = $this->actingAs($manager)->postJson(
            "/api/v1/products/{$this->product->id}/promotions",
            array_merge($base, ['name' => 'Copia', 'starts_at' => $d(2), 'ends_at' => $d(8)]),
        );
        $resp->assertStatus(422);
        $this->assertStringContainsString('Verano', (string) $resp->json('error'));

        // Mismo 2x1 pero ventana que NO se encima (+10 → +15) → se permite.
        $this->actingAs($manager)->postJson(
            "/api/v1/products/{$this->product->id}/promotions",
            array_merge($base, ['name' => 'Diciembre', 'starts_at' => $d(10), 'ends_at' => $d(15)]),
        )->assertStatus(201);

        // NxM DISTINTO (3x2) encimado con A → no es duplicado… pero ya hay 2
        // activas → lo frena el TOPE (mensaje del cap, no del duplicado).
        $resp = $this->actingAs($manager)->postJson(
            "/api/v1/products/{$this->product->id}/promotions",
            ['name' => 'Tercera', 'buy_n' => 3, 'pay_m' => 2, 'priority' => 0, 'store_id' => $this->storeA->id, 'starts_at' => $d(0), 'ends_at' => $d(5)],
        );
        $resp->assertStatus(422);
        $this->assertStringContainsString('2 promociones activas', (string) $resp->json('error'));

        // Mismo 2x1 encimado pero en OTRA tienda → el dup-check de tiendas
        // distintas no choca (validado creando la ajena y posteando en B).
        $managerB = $this->makeManager($this->storeB);
        $this->actingAs($managerB)->postJson(
            "/api/v1/products/{$this->product->id}/promotions",
            ['name' => 'Verano B', 'buy_n' => 2, 'pay_m' => 1, 'priority' => 0, 'store_id' => $this->storeB->id, 'starts_at' => $d(0), 'ends_at' => $d(5)],
        )->assertStatus(201);
    }

    public function test_products_embed_filters_promos_by_store(): void
    {
        $this->makePromo($this->storeB->id);
        $globalPromo = $this->makePromo(null);

        $resp = $this->actingAs($this->user)->getJson("/api/v1/products?light=1&per_page=0&store_id={$this->storeA->id}&include_unassigned=1");
        $resp->assertOk();
        $row = collect($resp->json('data'))->firstWhere('id', $this->product->id);
        $ids = array_column($row['active_promotions'] ?? [], 'id');

        $this->assertContains($globalPromo->id, $ids);
        $this->assertCount(1, $ids, 'La promo de otra tienda no debe venir en el embed');
    }

    // ── Override local (Joel 2026-07-20): la promo de TIENDA apaga la GLOBAL ─

    private function checkoutQty(int $qty, float $payment): \Illuminate\Testing\TestResponse
    {
        return $this->actingAs($this->user)->postJson('/api/v1/sales', [
            'store_id'            => $this->storeA->id,
            'register_session_id' => $this->session->id,
            'calc_version'        => 2,
            'items'               => [['product_id' => $this->product->id, 'quantity' => $qty, 'price' => 100.0]],
            'payments'            => [['payment_method_id' => $this->cashMethod->id, 'amount' => $payment]],
        ]);
    }

    public function test_local_gana_sobre_global_aunque_ahorre_menos(): void
    {
        // Global 2x1 (en 4 pzas daría 2 gratis = -$200); local 4x3 (1 gratis =
        // -$100). Con override, en tienda A aplica LA LOCAL: total $300.
        $this->makePromo(null);
        $local = ProductPromotion::create([
            'product_id' => $this->product->id, 'store_id' => $this->storeA->id,
            'name' => '4x3 Local A', 'buy_n' => 4, 'pay_m' => 3, 'status' => 'active',
        ]);

        $this->checkoutQty(4, 300.0)->assertStatus(201)->assertJsonPath('data.total', 300);

        $item = \App\Models\SaleItem::orderByDesc('id')->firstOrFail();
        $this->assertSame($local->id, (int) $item->applied_promotion_id);
    }

    public function test_global_no_revive_si_la_local_no_alcanza(): void
    {
        // Global 2x1 + local 3x2: con 2 pzas la local no alcanza — y la global
        // NO revive (la tienda decidió su propia promo). Precio completo $200.
        $this->makePromo(null);
        ProductPromotion::create([
            'product_id' => $this->product->id, 'store_id' => $this->storeA->id,
            'name' => '3x2 Local A', 'buy_n' => 3, 'pay_m' => 2, 'status' => 'active',
        ]);

        $this->checkoutQty(2, 200.0)->assertStatus(201)->assertJsonPath('data.total', 200);
    }

    public function test_local_de_otra_tienda_no_apaga_la_global_aqui(): void
    {
        // La local es de la tienda B → en tienda A la global sigue viva.
        $this->makePromo(null);
        ProductPromotion::create([
            'product_id' => $this->product->id, 'store_id' => $this->storeB->id,
            'name' => '4x3 Local B', 'buy_n' => 4, 'pay_m' => 3, 'status' => 'active',
        ]);

        $this->checkoutQty(2, 100.0)->assertStatus(201)->assertJsonPath('data.total', 100);
    }

    public function test_crear_local_sobre_global_encimada_se_permite(): void
    {
        // Antes chocaba (dup/typeConflict con "global choca con todas") — ahora
        // el ámbito es EXACTO: la local es un reemplazo deliberado.
        $this->makePromo(null); // global 2x1 sin ventana (infinita)
        $manager = $this->makeManager($this->storeA);

        // Mismo 2x1 local → permitido.
        $this->actingAs($manager)
            ->postJson("/api/v1/products/{$this->product->id}/promotions", [
                'name' => '2x1 de mi tienda', 'buy_n' => 2, 'pay_m' => 1,
            ])->assertStatus(201);

        // También de OTRO tipo (qty_discount) encima de la global NxM (en otra
        // tienda, para no chocar con la local 2x1 recién creada en A).
        $managerB = $this->makeManager($this->storeB);
        $this->actingAs($managerB)
            ->postJson("/api/v1/products/{$this->product->id}/promotions", [
                'name' => 'Cantidad B', 'type' => 'qty_discount',
                'tiers' => [['qty' => 2, 'amount' => 50]],
            ])->assertStatus(201);
    }

    public function test_local_vs_local_misma_tienda_siguen_chocando(): void
    {
        $manager = $this->makeManager($this->storeA);
        ProductPromotion::create([
            'product_id' => $this->product->id, 'store_id' => $this->storeA->id,
            'name' => '2x1 Local A', 'buy_n' => 2, 'pay_m' => 1, 'status' => 'active',
        ]);

        // Mismo NxM local en la misma tienda con ventana encimada → 422.
        $this->actingAs($manager)
            ->postJson("/api/v1/products/{$this->product->id}/promotions", [
                'name' => 'Otro 2x1 A', 'buy_n' => 2, 'pay_m' => 1,
            ])->assertStatus(422);

        // Y de tipo distinto en la misma tienda también choca (exclusividad).
        $this->actingAs($manager)
            ->postJson("/api/v1/products/{$this->product->id}/promotions", [
                'name' => 'Cantidad A', 'type' => 'qty_discount',
                'tiers' => [['qty' => 2, 'amount' => 50]],
            ])->assertStatus(422);
    }
}
