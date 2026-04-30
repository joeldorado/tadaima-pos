<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Customer;
use App\Models\PreSaleCatalog;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Hash;
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
}
