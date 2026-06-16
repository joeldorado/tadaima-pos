<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Customer;
use App\Models\PreSaleCatalog;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class PreSaleCatalogsTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $company = Company::create(['name' => 'Test Company']);
        $store   = Store::create(['company_id' => $company->id, 'name' => 'Test Store']);
        $this->user = User::create([
            'name'       => 'Test Admin',
            'email'      => 'admin@test.com',
            'password'   => bcrypt('password'),
            'company_id' => $company->id,
            'store_id'   => $store->id,
        ]);

        $roleId = DB::table('roles')->insertGetId([
            'name'       => 'admin',
            'guard_name' => 'api',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('model_has_roles')->insert([
            'role_id'    => $roleId,
            'model_type' => User::class,
            'model_id'   => $this->user->id,
        ]);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private function makeCatalog(array $overrides = []): PreSaleCatalog
    {
        return PreSaleCatalog::create(array_merge([
            'product_name' => 'Test Product',
            'price_1'      => 100.00,
            'status'       => PreSaleCatalog::STATUS_DRAFT,
            'created_by'   => $this->user->id,
        ], $overrides));
    }

    // ── Tests ─────────────────────────────────────────────────────────────────

    public function test_admin_can_list_catalogs(): void
    {
        $this->makeCatalog();

        $response = $this->actingAs($this->user)
            ->getJson('/api/v1/pre-sale-catalogs');

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonStructure(['data' => ['data']]);
    }

    public function test_admin_can_create_catalog(): void
    {
        $response = $this->actingAs($this->user)
            ->postJson('/api/v1/pre-sale-catalogs', [
                'product_name' => 'Dragon Ball Z Vol.1',
                'price_1'      => 299.99,
            ]);

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.product_name', 'Dragon Ball Z Vol.1')
            ->assertJsonPath('data.status', PreSaleCatalog::STATUS_DRAFT);

        $this->assertDatabaseHas('pre_sale_catalogs', [
            'product_name' => 'Dragon Ball Z Vol.1',
        ]);
    }

    public function test_catalog_can_be_published(): void
    {
        $catalog = $this->makeCatalog(['status' => PreSaleCatalog::STATUS_DRAFT]);

        $response = $this->actingAs($this->user)
            ->patchJson("/api/v1/pre-sale-catalogs/{$catalog->id}/status", [
                'status' => 'published',
            ]);

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'published');

        $this->assertDatabaseHas('pre_sale_catalogs', [
            'id'     => $catalog->id,
            'status' => 'published',
        ]);
    }

    public function test_catalog_can_be_closed(): void
    {
        $catalog = $this->makeCatalog(['status' => PreSaleCatalog::STATUS_PUBLISHED]);

        $response = $this->actingAs($this->user)
            ->patchJson("/api/v1/pre-sale-catalogs/{$catalog->id}/status", [
                'status' => 'closed',
            ]);

        $response->assertStatus(200)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.status', 'closed');
    }

    public function test_catalog_can_be_cancelled(): void
    {
        $catalog = $this->makeCatalog(['status' => PreSaleCatalog::STATUS_PUBLISHED]);

        $response = $this->actingAs($this->user)
            ->patchJson("/api/v1/pre-sale-catalogs/{$catalog->id}/status", [
                'status' => 'cancelled',
            ]);

        $response->assertStatus(200)
            ->assertJsonPath('data.status', 'cancelled');
    }

    public function test_invalid_status_transition_returns_422(): void
    {
        // draft → closed is not a permitted transition
        $catalog = $this->makeCatalog(['status' => PreSaleCatalog::STATUS_DRAFT]);

        $response = $this->actingAs($this->user)
            ->patchJson("/api/v1/pre-sale-catalogs/{$catalog->id}/status", [
                'status' => 'closed',
            ]);

        $response->assertStatus(422)
            ->assertJsonPath('success', false);

        $this->assertDatabaseHas('pre_sale_catalogs', [
            'id'     => $catalog->id,
            'status' => 'draft',
        ]);
    }

    public function test_admin_can_filter_catalogs_by_status(): void
    {
        $this->makeCatalog(['status' => PreSaleCatalog::STATUS_DRAFT]);
        $this->makeCatalog(['status' => PreSaleCatalog::STATUS_PUBLISHED]);

        $response = $this->actingAs($this->user)
            ->getJson('/api/v1/pre-sale-catalogs?status=published');

        $response->assertStatus(200);

        $items = $response->json('data.data');
        $this->assertCount(1, $items);
        $this->assertSame('published', $items[0]['status']);
    }

    /**
     * Regresión QA 2026-06-11: reserved_by_store debe llegar como OBJETO
     * {"store_id": qty}. JsonResource::removeMissingValues aplica
     * array_values() a arrays con keys 100% numéricas → {4:2} llegaba como
     * [2] y la Caja no restaba apartados ("20 disponibles" con 2 vendidos).
     */
    public function test_reserved_by_store_is_keyed_by_store_id(): void
    {
        $catalog = $this->makeCatalog(['status' => PreSaleCatalog::STATUS_PUBLISHED]);
        $store = Store::first();

        $customer = Customer::create(['name' => 'Cliente Test']);
        $order = \App\Models\PreSaleOrder::create([
            'code'        => 'PREV-TEST1',
            'customer_id' => $customer->id,
            'store_id'    => $store->id,
            'user_id'     => $this->user->id,
            'status'      => \App\Models\PreSaleOrder::STATUS_PENDING,
            'total'       => 200,
        ]);
        \App\Models\PreSaleOrderItem::create([
            'pre_sale_order_id'   => $order->id,
            'pre_sale_catalog_id' => $catalog->id,
            'product_name'        => 'Test Product',
            'quantity'            => 2,
            'unit_price'          => 100,
            'status'              => \App\Models\PreSaleOrderItem::STATUS_PENDING,
        ]);

        $response = $this->actingAs($this->user, 'sanctum')
            ->getJson('/api/v1/pre-sale-catalogs');

        $response->assertOk();
        $row = collect($response->json('data.data'))->firstWhere('id', $catalog->id);
        $this->assertIsArray($row['reserved_by_store']);
        // Key = store id (string en JSON), no índice posicional.
        $this->assertSame(2, $row['reserved_by_store'][(string) $store->id] ?? null);
        $this->assertArrayNotHasKey(0, $row['reserved_by_store']);
    }

    public function test_delivered_by_store_is_keyed_by_store_id(): void
    {
        $catalog = $this->makeCatalog(['status' => PreSaleCatalog::STATUS_PUBLISHED]);
        $store = Store::first();

        $customer = Customer::create(['name' => 'Cliente Test']);
        $order = \App\Models\PreSaleOrder::create([
            'code'        => 'PREV-DELIV1',
            'customer_id' => $customer->id,
            'store_id'    => $store->id,
            'user_id'     => $this->user->id,
            'status'      => \App\Models\PreSaleOrder::STATUS_DELIVERED,
            'total'       => 300,
        ]);
        \App\Models\PreSaleOrderItem::create([
            'pre_sale_order_id'   => $order->id,
            'pre_sale_catalog_id' => $catalog->id,
            'product_name'        => 'Test Product',
            'quantity'            => 3,
            'unit_price'          => 100,
            'status'              => \App\Models\PreSaleOrderItem::STATUS_DELIVERED,
        ]);

        $response = $this->actingAs($this->user, 'sanctum')
            ->getJson('/api/v1/pre-sale-catalogs');

        $response->assertOk();
        $row = collect($response->json('data.data'))->firstWhere('id', $catalog->id);
        // Liquidados agrupados por tienda, keyed por store id (no índice posicional).
        $this->assertIsArray($row['delivered_by_store']);
        $this->assertSame(3, $row['delivered_by_store'][(string) $store->id] ?? null);
        $this->assertArrayNotHasKey(0, $row['delivered_by_store']);
        // Un entregado NO cuenta como apartado (delivered ≠ pending/ready).
        $this->assertArrayNotHasKey((string) $store->id, $row['reserved_by_store'] ?? []);
    }
}
