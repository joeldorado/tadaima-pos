<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Customer;
use App\Models\PreSaleCatalog;
use App\Models\PreSaleOrder;
use App\Models\PreSaleOrderItem;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Límite de unidades POR CLIENTE por catálogo de preventa (2026-06-17):
 *  - Por catálogo y POR TIENDA (regla de Pier, 2026-11-18): lo apartado en una
 *    sucursal no gasta el límite de otra. Antes era global.
 *  - De por vida en esa tienda (cuenta pending+ready+delivered, no cancelados).
 *  - Bloquea (422) al superarlo.
 *  - Identidad amplia: mismo id / teléfono / socio Tadaima cuentan juntos.
 */
class PreSaleCustomerLimitTest extends TestCase
{
    use RefreshDatabase;

    private User $user;
    private Store $store;
    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();

        $company = Company::create(['name' => 'Test Co']);
        $this->store = Store::create(['company_id' => $company->id, 'name' => 'Test Store']);
        $this->user = User::create([
            'name' => 'Cajero', 'email' => 'cajero@test.com', 'password' => bcrypt('x'),
            'company_id' => $company->id, 'store_id' => $this->store->id,
        ]);
        $this->customer = Customer::create(['name' => 'Ana Torres']);
    }

    private function makeCatalog(?int $limitPerCustomer): PreSaleCatalog
    {
        $catalog = PreSaleCatalog::create([
            'product_name' => 'Tomo X', 'price_1' => 150.00,
            'status' => PreSaleCatalog::STATUS_PUBLISHED, 'created_by' => $this->user->id,
            'limit_per_customer' => $limitPerCustomer,
        ]);
        // store_limit alto → el cupo por tienda no interfiere con la prueba.
        $catalog->storeLimits()->create(['store_id' => $this->store->id, 'limit_qty' => 999]);
        return $catalog;
    }

    private function payload(PreSaleCatalog $catalog, int $customerId, int $qty): array
    {
        return [
            'store_id' => $this->store->id,
            'customer_id' => $customerId,
            'items' => [['catalog_id' => $catalog->id, 'quantity' => $qty, 'price_level' => 1]],
        ];
    }

    private function seedFolio(PreSaleCatalog $catalog, int $customerId, int $qty, string $status): PreSaleOrder
    {
        $order = PreSaleOrder::create([
            'code' => 'PREV-SEED-' . uniqid(), 'store_id' => $this->store->id,
            'user_id' => $this->user->id, 'customer_id' => $customerId, 'status' => $status,
        ]);
        PreSaleOrderItem::create([
            'pre_sale_order_id' => $order->id, 'pre_sale_catalog_id' => $catalog->id,
            'product_id' => null, 'quantity' => $qty, 'price_level' => 1, 'unit_price' => 150.00,
            'status' => 'pending',
        ]);
        return $order;
    }

    public function test_per_customer_limit_blocks_when_exceeded(): void
    {
        $catalog = $this->makeCatalog(2);

        // 2 unidades → OK (justo el límite).
        $this->actingAs($this->user)
            ->postJson('/api/v1/pre-sale-orders', $this->payload($catalog, $this->customer->id, 2))
            ->assertStatus(200);

        // 1 más → 422 (ya tiene 2/2).
        $this->actingAs($this->user)
            ->postJson('/api/v1/pre-sale-orders', $this->payload($catalog, $this->customer->id, 1))
            ->assertStatus(422)
            ->assertJsonPath('success', false);
    }

    public function test_delivered_folios_count_toward_lifetime_limit(): void
    {
        $catalog = $this->makeCatalog(2);
        $this->seedFolio($catalog, $this->customer->id, 2, PreSaleOrder::STATUS_DELIVERED);

        // Ya entregó 2 de por vida → no puede llevar más.
        $this->actingAs($this->user)
            ->postJson('/api/v1/pre-sale-orders', $this->payload($catalog, $this->customer->id, 1))
            ->assertStatus(422);
    }

    public function test_cancelled_folios_do_not_count(): void
    {
        $catalog = $this->makeCatalog(2);
        $this->seedFolio($catalog, $this->customer->id, 2, PreSaleOrder::STATUS_CANCELLED);

        // El folio cancelado NO cuenta → puede llevar 2.
        $this->actingAs($this->user)
            ->postJson('/api/v1/pre-sale-orders', $this->payload($catalog, $this->customer->id, 2))
            ->assertStatus(200);
    }

    public function test_limit_counts_duplicate_customer_by_phone(): void
    {
        $catalog = $this->makeCatalog(2);
        $a = Customer::create(['name' => 'Juan A', 'phone' => '5512345678']);
        $b = Customer::create(['name' => 'Juan B (dup)', 'phone' => '55 1234 5678']); // mismos dígitos

        $this->seedFolio($catalog, $a->id, 2, PreSaleOrder::STATUS_PENDING);

        // b es la misma persona por teléfono → ya tiene 2 → bloquea.
        $this->actingAs($this->user)
            ->postJson('/api/v1/pre-sale-orders', $this->payload($catalog, $b->id, 1))
            ->assertStatus(422);
    }

    public function test_limit_counts_duplicate_when_one_record_has_card_and_other_only_phone(): void
    {
        // Caso real de duplicado: la misma persona registrada 2 veces — una con
        // tarjeta Tadaima + teléfono, otra solo con el mismo teléfono. El match
        // por teléfono los cuenta juntos (la tarjeta es única, no se duplica).
        $catalog = $this->makeCatalog(2);
        $conCard = Customer::create(['name' => 'Socio', 'external_member_id' => 'TAD-100', 'phone' => '5512345678']);
        $soloTel = Customer::create(['name' => 'Socio dup', 'phone' => '5512345678']);

        $this->seedFolio($catalog, $conCard->id, 2, PreSaleOrder::STATUS_PENDING);

        $this->actingAs($this->user)
            ->postJson('/api/v1/pre-sale-orders', $this->payload($catalog, $soloTel->id, 1))
            ->assertStatus(422);
    }

    public function test_no_limit_allows_unlimited(): void
    {
        $catalog = $this->makeCatalog(null);

        $this->actingAs($this->user)
            ->postJson('/api/v1/pre-sale-orders', $this->payload($catalog, $this->customer->id, 50))
            ->assertStatus(200);
    }

    public function test_customer_usage_endpoint_returns_used_limit_remaining(): void
    {
        $catalog = $this->makeCatalog(5);
        $this->seedFolio($catalog, $this->customer->id, 2, PreSaleOrder::STATUS_PENDING);

        $resp = $this->actingAs($this->user)
            ->getJson("/api/v1/pre-sale-catalogs/{$catalog->id}/customer-usage?customer_id={$this->customer->id}")
            ->assertStatus(200)
            ->json('data');

        $this->assertSame(5, $resp['limit']);
        $this->assertSame(2, $resp['used']);
        $this->assertSame(3, $resp['remaining']);
    }

    // ── Límite por sucursal (regla de Pier, 2026-11-18) ───────────────────────

    /** Segunda sucursal con cupo en el catálogo y un cajero propio. */
    private function secondStore(PreSaleCatalog $catalog): array
    {
        $store = Store::create(['company_id' => $this->store->company_id, 'name' => 'Macro']);
        $catalog->storeLimits()->create(['store_id' => $store->id, 'limit_qty' => 999]);
        $cashier = User::create([
            'name' => 'Cajero Macro', 'email' => 'macro@test.com', 'password' => bcrypt('x'),
            'company_id' => $this->store->company_id, 'store_id' => $store->id,
        ]);

        return [$store, $cashier];
    }

    /** Aparta desde la segunda sucursal. */
    private function orderAt(Store $store, User $cashier, PreSaleCatalog $catalog, int $customerId, int $qty): \Illuminate\Testing\TestResponse
    {
        return $this->actingAs($cashier)->postJson('/api/v1/pre-sale-orders', [
            'store_id' => $store->id,
            'customer_id' => $customerId,
            'items' => [['catalog_id' => $catalog->id, 'quantity' => $qty, 'price_level' => 1]],
        ]);
    }

    public function test_el_limite_se_cuenta_por_separado_en_cada_tienda(): void
    {
        $catalog = $this->makeCatalog(2);
        [$macro, $cajeroMacro] = $this->secondStore($catalog);

        // 2 en Centro y 2 en Macro: cada tienda tiene su propio límite.
        $this->actingAs($this->user)
            ->postJson('/api/v1/pre-sale-orders', $this->payload($catalog, $this->customer->id, 2))
            ->assertStatus(200);
        $this->orderAt($macro, $cajeroMacro, $catalog, $this->customer->id, 2)->assertStatus(200);

        // La tercera en Macro ya pasa el límite de esa tienda.
        $res = $this->orderAt($macro, $cajeroMacro, $catalog, $this->customer->id, 1)->assertStatus(422);
        $this->assertStringContainsString('por cliente en esta tienda', (string) $res->json('error'));
    }

    public function test_duplicado_por_telefono_bloquea_en_su_tienda_y_no_suma_entre_tiendas(): void
    {
        $catalog = $this->makeCatalog(2);
        [$macro, $cajeroMacro] = $this->secondStore($catalog);
        $a = Customer::create(['name' => 'Juan A', 'phone' => '5512345678']);
        $b = Customer::create(['name' => 'Juan B (dup)', 'phone' => '55 1234 5678']);

        $this->seedFolio($catalog, $a->id, 2, PreSaleOrder::STATUS_PENDING); // en Centro

        // Misma persona, misma tienda: bloquea.
        $this->actingAs($this->user)
            ->postJson('/api/v1/pre-sale-orders', $this->payload($catalog, $b->id, 1))
            ->assertStatus(422);

        // Misma persona, otra tienda: lo de Centro no cuenta aquí.
        $this->orderAt($macro, $cajeroMacro, $catalog, $b->id, 2)->assertStatus(200);
    }

    public function test_entregados_de_otra_tienda_no_gastan_el_limite(): void
    {
        $catalog = $this->makeCatalog(2);
        [$macro, $cajeroMacro] = $this->secondStore($catalog);
        $this->seedFolio($catalog, $this->customer->id, 2, PreSaleOrder::STATUS_DELIVERED); // en Centro

        $this->orderAt($macro, $cajeroMacro, $catalog, $this->customer->id, 2)->assertStatus(200);
    }

    public function test_customer_usage_cuenta_solo_la_tienda_pedida(): void
    {
        $catalog = $this->makeCatalog(2);
        [$macro, $cajeroMacro] = $this->secondStore($catalog);
        $this->seedFolio($catalog, $this->customer->id, 2, PreSaleOrder::STATUS_PENDING); // en Centro
        $url = "/api/v1/pre-sale-catalogs/{$catalog->id}/customer-usage?customer_id={$this->customer->id}";

        $centro = $this->actingAs($this->user)->getJson("{$url}&store_id={$this->store->id}")->assertStatus(200)->json('data');
        $this->assertSame(2, $centro['used']);
        $this->assertSame(0, $centro['remaining']);

        $enMacro = $this->actingAs($cajeroMacro)->getJson("{$url}&store_id={$macro->id}")->assertStatus(200)->json('data');
        $this->assertSame(0, $enMacro['used']);
        $this->assertSame(2, $enMacro['remaining']);
    }

    public function test_customer_usage_sin_tienda_usa_la_del_usuario(): void
    {
        // Es lo que manda un bundle viejo de la PWA tras el deploy.
        $catalog = $this->makeCatalog(2);
        [, $cajeroMacro] = $this->secondStore($catalog);
        $this->seedFolio($catalog, $this->customer->id, 2, PreSaleOrder::STATUS_PENDING); // en Centro

        $resp = $this->actingAs($cajeroMacro)
            ->getJson("/api/v1/pre-sale-catalogs/{$catalog->id}/customer-usage?customer_id={$this->customer->id}")
            ->assertStatus(200)
            ->json('data');

        $this->assertSame(0, $resp['used']);
    }

    public function test_customer_usage_rechaza_una_tienda_que_no_es_numero(): void
    {
        $catalog = $this->makeCatalog(2);

        $this->actingAs($this->user)
            ->getJson("/api/v1/pre-sale-catalogs/{$catalog->id}/customer-usage?customer_id={$this->customer->id}&store_id=abc")
            ->assertStatus(422);
    }

    public function test_customer_usage_de_otra_tienda_recibe_403(): void
    {
        $catalog = $this->makeCatalog(2);
        [$macro] = $this->secondStore($catalog);

        $this->actingAs($this->user)
            ->getJson("/api/v1/pre-sale-catalogs/{$catalog->id}/customer-usage?customer_id={$this->customer->id}&store_id={$macro->id}")
            ->assertStatus(403);
    }
}
