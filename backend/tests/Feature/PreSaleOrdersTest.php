<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Customer;
use App\Models\PreSaleCatalog;
use App\Models\PreSaleOrder;
use App\Models\PreSaleOrderItem;
use App\Models\PreSaleOrderPayment;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
use Tests\TestCase;

class PreSaleOrdersTest extends TestCase
{
    use RefreshDatabase;

    private User $user;
    private Store $store;
    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();

        $company = Company::create(['name' => 'Test Company']);
        $this->store = Store::create(['company_id' => $company->id, 'name' => 'Test Store']);
        $this->user = User::create([
            'name'       => 'Test Cashier',
            'email'      => 'cashier@test.com',
            'password'   => bcrypt('password'),
            'company_id' => $company->id,
            'store_id'   => $this->store->id,
        ]);
        $this->customer = Customer::create(['name' => 'Ana Torres']);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private function makePublishedCatalog(array $overrides = []): PreSaleCatalog
    {
        $storeLimit = $overrides['store_limit'] ?? 99;
        unset($overrides['store_limit']);

        $catalog = PreSaleCatalog::create(array_merge([
            'product_name'   => 'Test Manga',
            'price_1'        => 150.00,
            'status'         => PreSaleCatalog::STATUS_PUBLISHED,
            'created_by'     => $this->user->id,
            'preorder_limit' => null,
        ], $overrides));

        // Cambio Joel 2026-05-20: store_limits es obligatorio para vender.
        // Sin entrada el catálogo no se vende en ninguna tienda.
        $catalog->storeLimits()->create([
            'store_id'  => $this->store->id,
            'limit_qty' => $storeLimit,
        ]);

        return $catalog;
    }

    private function createOrderPayload(PreSaleCatalog $catalog, array $overrides = []): array
    {
        return array_merge([
            'store_id'    => $this->store->id,
            'customer_id' => $this->customer->id,
            'items'       => [[
                'catalog_id'  => $catalog->id,
                'quantity'    => 1,
                'price_level' => 1,
            ]],
        ], $overrides);
    }

    private function createPendingOrder(PreSaleCatalog $catalog): PreSaleOrder
    {
        $response = $this->actingAs($this->user)
            ->postJson('/api/v1/pre-sale-orders', $this->createOrderPayload($catalog));

        $this->assertTrue($response->json('success'), 'createPendingOrder helper failed: ' . $response->content());

        return PreSaleOrder::find($response->json('data.id'));
    }

    // ── Tests ─────────────────────────────────────────────────────────────────

    public function test_cashier_can_create_order_from_published_catalog(): void
    {
        $catalog = $this->makePublishedCatalog();

        $response = $this->actingAs($this->user)
            ->postJson('/api/v1/pre-sale-orders', $this->createOrderPayload($catalog));

        $response->assertStatus(200)
            ->assertJsonPath('success', true);

        $this->assertMatchesRegularExpression(
            '/^PREV-\d+$/',
            $response->json('data.code')
        );

        $this->assertDatabaseHas('pre_sale_orders', [
            'customer_id' => $this->customer->id,
            'store_id'    => $this->store->id,
            'status'      => 'pending',
        ]);
    }

    public function test_create_order_requires_customer_id(): void
    {
        $catalog = $this->makePublishedCatalog();

        $response = $this->actingAs($this->user)
            ->postJson('/api/v1/pre-sale-orders', [
                'store_id' => $this->store->id,
                'items'    => [[
                    'catalog_id'  => $catalog->id,
                    'quantity'    => 1,
                    'price_level' => 1,
                ]],
            ]);

        $response->assertStatus(422)
            ->assertJsonPath('success', false);
    }

    public function test_create_order_fails_for_draft_catalog(): void
    {
        $draftCatalog = PreSaleCatalog::create([
            'product_name' => 'Draft Item',
            'price_1'      => 100.00,
            'status'       => PreSaleCatalog::STATUS_DRAFT,
            'created_by'   => $this->user->id,
        ]);

        $response = $this->actingAs($this->user)
            ->postJson('/api/v1/pre-sale-orders', $this->createOrderPayload($draftCatalog));

        $response->assertStatus(422)
            ->assertJsonPath('success', false);
    }

    public function test_preorder_limit_is_enforced(): void
    {
        // store_limit=1 → la tienda solo permite 1 unidad de preventa
        // (antes este test usaba preorder_limit como cap global; ahora la cap
        // vive en pre_sale_catalog_store_limits por tienda).
        $catalog = $this->makePublishedCatalog(['store_limit' => 1]);

        // First order fits within the limit
        $first = $this->actingAs($this->user)
            ->postJson('/api/v1/pre-sale-orders', $this->createOrderPayload($catalog));
        $first->assertStatus(200);

        // Second order exceeds the limit
        $second = $this->actingAs($this->user)
            ->postJson('/api/v1/pre-sale-orders', $this->createOrderPayload($catalog));
        $second->assertStatus(422)
            ->assertJsonPath('success', false);
    }

    public function test_catalog_without_store_limits_cannot_be_sold(): void
    {
        // Catálogo publicado pero sin entrada en store_limits para la tienda.
        // Cambio Joel 2026-05-20: ya no hay fallback a preorder_limit global.
        $catalog = PreSaleCatalog::create([
            'product_name'   => 'Sin Stock por Tienda',
            'price_1'        => 100.00,
            'status'         => PreSaleCatalog::STATUS_PUBLISHED,
            'created_by'     => $this->user->id,
            'preorder_limit' => 10,
        ]);

        $response = $this->actingAs($this->user)
            ->postJson('/api/v1/pre-sale-orders', $this->createOrderPayload($catalog));

        $response->assertStatus(422)
            ->assertJsonPath('success', false);
    }

    public function test_admin_can_list_orders_filtered_by_status(): void
    {
        $catalog = $this->makePublishedCatalog();
        $order   = $this->createPendingOrder($catalog);

        // Manually set one order to cancelled
        PreSaleOrder::create([
            'code'        => 'PREV-99999',
            'store_id'    => $this->store->id,
            'user_id'     => $this->user->id,
            'customer_id' => $this->customer->id,
            'status'      => PreSaleOrder::STATUS_CANCELLED,
        ]);

        $response = $this->actingAs($this->user)
            ->getJson('/api/v1/pre-sale-orders?status=pending');

        $response->assertStatus(200);

        $items = $response->json('data.data');
        $this->assertCount(1, $items);
        $this->assertSame('pending', $items[0]['status']);
    }

    public function test_payment_date_filter_returns_folio_liquidated_in_range_even_if_created_before(): void
    {
        // Fechas en TZ de negocio (Tijuana) para evitar desfase con el filtro.
        $tz       = \App\Support\DateRange::timezone();
        $today    = now($tz)->toDateString();
        $noonToday = \Carbon\Carbon::parse("{$today} 12:00:00", $tz)->utc();

        // Folio creado hace 10 días (fuera del rango de "hoy").
        $catalog = $this->makePublishedCatalog();
        $order   = $this->createPendingOrder($catalog);
        $order->forceFill(['created_at' => $noonToday->copy()->subDays(10)])->save();

        // Anticipo viejo (hace 10 días) + liquidación HOY (mediodía Tijuana).
        $anticipo = PreSaleOrderPayment::create(['pre_sale_order_id' => $order->id, 'amount' => 50.00]);
        $anticipo->created_at = $noonToday->copy()->subDays(10);
        $anticipo->save();
        $liquidacion = PreSaleOrderPayment::create(['pre_sale_order_id' => $order->id, 'amount' => 100.00]);
        $liquidacion->created_at = $noonToday->copy();
        $liquidacion->save();

        // Por fecha de CREACIÓN (hoy) NO sale: el folio se creó hace 10 días.
        $byCreated = $this->actingAs($this->user)
            ->getJson("/api/v1/pre-sale-orders?from={$today}&to={$today}");
        $byCreated->assertStatus(200);
        $this->assertCount(0, $byCreated->json('data.data'));

        // Por fecha de PAGO (hoy) SÍ sale: tuvo la liquidación hoy.
        $byPayment = $this->actingAs($this->user)
            ->getJson("/api/v1/pre-sale-orders?payment_from={$today}&payment_to={$today}");
        $byPayment->assertStatus(200);
        $this->assertCount(1, $byPayment->json('data.data'));
        $this->assertSame($order->id, $byPayment->json('data.data.0.id'));
    }

    public function test_mine_filter_returns_only_folios_created_or_paid_by_current_user(): void
    {
        $catalog = $this->makePublishedCatalog();

        // Folio A: creado por el usuario actual.
        $folioA = $this->createPendingOrder($catalog);

        // Otro cajero de la misma tienda.
        $otro = User::create([
            'name' => 'Otro Cajero', 'email' => 'otro@test.com', 'password' => bcrypt('x'),
            'company_id' => $this->store->company_id, 'store_id' => $this->store->id,
        ]);

        // Folio B: creado por el otro (NO debe salir).
        PreSaleOrder::create([
            'code' => 'PREV-B', 'store_id' => $this->store->id,
            'user_id' => $otro->id, 'customer_id' => $this->customer->id,
            'status' => PreSaleOrder::STATUS_PENDING,
        ]);

        // Folio C: creado por el otro, pero el usuario actual cobró (SÍ debe salir).
        $folioC = PreSaleOrder::create([
            'code' => 'PREV-C', 'store_id' => $this->store->id,
            'user_id' => $otro->id, 'customer_id' => $this->customer->id,
            'status' => PreSaleOrder::STATUS_PENDING,
        ]);
        PreSaleOrderPayment::create([
            'pre_sale_order_id' => $folioC->id, 'amount' => 30.00, 'cashier_id' => $this->user->id,
        ]);

        $res = $this->actingAs($this->user)->getJson('/api/v1/pre-sale-orders?mine=1');
        $res->assertStatus(200);
        $ids = collect($res->json('data.data'))->pluck('id')->all();
        $this->assertEqualsCanonicalizing([$folioA->id, $folioC->id], $ids);
    }

    public function test_cashier_can_add_payment_to_order(): void
    {
        $catalog = $this->makePublishedCatalog();
        $order   = $this->createPendingOrder($catalog);

        $response = $this->actingAs($this->user)
            ->postJson("/api/v1/pre-sale-orders/{$order->id}/payments", [
                'amount' => 50.00,
                'notes'  => 'Abono parcial',
            ]);

        $response->assertStatus(200)
            ->assertJsonPath('success', true);

        $this->assertEquals(50, $response->json('data.amount'));

        $this->assertDatabaseHas('pre_sale_order_payments', [
            'pre_sale_order_id' => $order->id,
            'amount'            => 50.00,
        ]);
    }

    public function test_admin_can_transition_order_to_ready(): void
    {
        $catalog = $this->makePublishedCatalog();
        $order   = $this->createPendingOrder($catalog);

        $response = $this->actingAs($this->user)
            ->patchJson("/api/v1/pre-sale-orders/{$order->id}/status", [
                'status' => 'ready',
            ]);

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'ready');

        $this->assertDatabaseHas('pre_sale_orders', [
            'id'     => $order->id,
            'status' => 'ready',
        ]);
    }

    public function test_cashier_can_liquidate_ready_order(): void
    {
        $catalog = $this->makePublishedCatalog();
        $order   = $this->createPendingOrder($catalog);

        // Catalog must be arrived so items can be marked delivered on liquidation
        $catalog->update(['status' => PreSaleCatalog::STATUS_ARRIVED]);

        // Transition to ready first
        $this->actingAs($this->user)
            ->patchJson("/api/v1/pre-sale-orders/{$order->id}/status", ['status' => 'ready'])
            ->assertStatus(200);

        $response = $this->actingAs($this->user)
            ->patchJson("/api/v1/pre-sale-orders/{$order->id}/status", [
                'status' => 'delivered',
            ]);

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'delivered');
    }

    public function test_cannot_deliver_pending_order(): void
    {
        $catalog = $this->makePublishedCatalog();
        $order   = $this->createPendingOrder($catalog);

        // Attempt to deliver directly from pending (must go through ready first)
        $response = $this->actingAs($this->user)
            ->patchJson("/api/v1/pre-sale-orders/{$order->id}/status", [
                'status' => 'delivered',
            ]);

        $response->assertStatus(422)
            ->assertJsonPath('success', false);

        $this->assertDatabaseHas('pre_sale_orders', [
            'id'     => $order->id,
            'status' => 'pending',
        ]);
    }

    public function test_cashier_can_toggle_item_delivery(): void
    {
        $catalog = $this->makePublishedCatalog();
        $order   = $this->createPendingOrder($catalog);

        $item = PreSaleOrderItem::where('pre_sale_order_id', $order->id)->firstOrFail();

        // Mark item as delivered
        $deliver = $this->actingAs($this->user)
            ->patchJson("/api/v1/pre-sale-orders/{$order->id}/items/{$item->id}/deliver", [
                'status' => 'delivered',
            ]);

        $deliver->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'delivered');

        // Toggle back to pending
        $revert = $this->actingAs($this->user)
            ->patchJson("/api/v1/pre-sale-orders/{$order->id}/items/{$item->id}/deliver", [
                'status' => 'pending',
            ]);

        $revert->assertStatus(200)
            ->assertJsonPath('data.status', 'pending');

        $this->assertDatabaseHas('pre_sale_order_items', [
            'id'          => $item->id,
            'status'      => 'pending',
            'delivered_at' => null,
        ]);
    }
}
