<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\PreSaleCatalog;
use App\Models\SalesDraft;
use App\Models\SalesDraftItem;
use App\Models\Store;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Cobertura de los fixes del QA del 2026-05-07 (ver MASTERLOG y commit message).
 * Bugs cubiertos:
 *  - Bug 1: crear sucursal sin company_id en payload (lo deriva del user)
 *  - Bug 2: crear bodega sin company_id en payload (idem)
 *  - Bug 6: validación pickup_deadline >= arrival_date en catálogo de preventa
 *  - Bug 14: cleanup de drafts huérfanos (drafts:cleanup + scope stale)
 */
class QABugFixesTest extends TestCase
{
    use RefreshDatabase;

    private User $user;
    private Company $company;
    private Store $store;

    protected function setUp(): void
    {
        parent::setUp();

        $this->company = Company::create(['name' => 'Tadaima QA']);
        $this->store   = Store::create(['company_id' => $this->company->id, 'name' => 'Tienda QA']);
        $this->user = User::create([
            'name'       => 'QA Admin',
            'email'      => 'qa-admin@test.com',
            'password'   => bcrypt('password'),
            'company_id' => $this->company->id,
            'store_id'   => $this->store->id,
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

    // ── Bug 1 ─────────────────────────────────────────────────────────────────

    public function test_bug1_create_store_derives_company_from_user(): void
    {
        $response = $this->actingAs($this->user, 'sanctum')
            ->postJson('/api/v1/stores', [
                // sin company_id — debe inferirlo del user autenticado
                'name'   => 'Tienda Playas',
                'active' => true,
            ]);

        $response->assertCreated();
        $this->assertDatabaseHas('stores', [
            'name'       => 'Tienda Playas',
            'company_id' => $this->company->id,
        ]);
    }

    public function test_create_store_auto_creates_default_store_warehouse(): void
    {
        // Bug QA 2026-06-03: crear una tienda por UI no creaba su almacén, así
        // que la tienda nueva nunca aparecía en el selector de alta de producto
        // (lista warehouses, no stores). Ahora se crea el warehouse type='store'.
        $response = $this->actingAs($this->user, 'sanctum')
            ->postJson('/api/v1/stores', [
                'name'   => 'Tienda Otay',
                'active' => true,
            ]);

        $response->assertCreated();
        $storeId = $response->json('data.id');

        $this->assertDatabaseHas('warehouses', [
            'store_id'   => $storeId,
            'company_id' => $this->company->id,
            'type'       => 'store',
            'name'       => 'Tienda Otay',
            'active'     => true,
        ]);

        // El nuevo warehouse aparece en GET /warehouses (lo que llena el selector).
        $this->actingAs($this->user, 'sanctum')
            ->getJson('/api/v1/warehouses?active=true')
            ->assertOk()
            ->assertJsonFragment(['store_id' => $storeId, 'type' => 'store']);
    }

    public function test_backfill_migration_creates_warehouse_for_legacy_stores(): void
    {
        // Bug QA 2026-06-03: las tiendas creadas por UI ANTES del fix quedaron sin
        // su almacén type='store' → invisibles en alta de producto. La migración
        // 2026_06_03_000001 las rellena. Aquí simulamos una tienda legacy (sin
        // bodega) y corremos la migración de backfill.
        $legacy = Store::create(['company_id' => $this->company->id, 'name' => 'Tienda Legacy']);
        DB::table('warehouses')->where('store_id', $legacy->id)->delete();

        $this->assertDatabaseMissing('warehouses', ['store_id' => $legacy->id, 'type' => 'store']);

        $migration = require database_path('migrations/2026_06_03_000001_backfill_missing_store_warehouses.php');
        $migration->up();

        $this->assertDatabaseHas('warehouses', [
            'store_id'   => $legacy->id,
            'company_id' => $this->company->id,
            'type'       => 'store',
            'name'       => 'Tienda Legacy',
            'active'     => true,
        ]);

        // Idempotente: correrla de nuevo no duplica la bodega.
        $migration->up();
        $this->assertEquals(
            1,
            DB::table('warehouses')->where('store_id', $legacy->id)->where('type', 'store')->count(),
        );
    }

    public function test_bug1_create_store_accepts_explicit_company_id(): void
    {
        $response = $this->actingAs($this->user, 'sanctum')
            ->postJson('/api/v1/stores', [
                'company_id' => $this->company->id,
                'name'       => 'Tienda Centro',
            ]);

        $response->assertCreated();
    }

    // ── Bug 2 ─────────────────────────────────────────────────────────────────

    public function test_bug2_create_warehouse_derives_company_from_user(): void
    {
        $response = $this->actingAs($this->user, 'sanctum')
            ->postJson('/api/v1/warehouses', [
                'name' => 'Bodega QA',
                'type' => 'central',
            ]);

        $response->assertCreated();
        $this->assertDatabaseHas('warehouses', [
            'name'       => 'Bodega QA',
            'company_id' => $this->company->id,
        ]);
    }

    // ── Bug 6 ─────────────────────────────────────────────────────────────────

    public function test_bug6_catalog_rejects_pickup_before_arrival(): void
    {
        $response = $this->actingAs($this->user, 'sanctum')
            ->postJson('/api/v1/pre-sale-catalogs', [
                'product_name'    => 'ETB Pokemon',
                'price_1'         => 1000,
                'arrival_date'    => '2026-06-26',
                'pickup_deadline' => '2026-04-27', // antes de llegada
            ]);

        $response->assertStatus(422);
        $response->assertJsonValidationErrors(['pickup_deadline']);
    }

    public function test_bug6_catalog_accepts_pickup_after_arrival(): void
    {
        $response = $this->actingAs($this->user, 'sanctum')
            ->postJson('/api/v1/pre-sale-catalogs', [
                'product_name'    => 'ETB Pokemon',
                'price_1'         => 1000,
                'arrival_date'    => '2026-06-01',
                'pickup_deadline' => '2026-07-01',
            ]);

        $response->assertSuccessful();
    }

    // ── Bug 14 ────────────────────────────────────────────────────────────────

    public function test_bug14_stale_scope_picks_old_empty_drafts(): void
    {
        // Draft sin items, viejo → stale
        $oldEmpty = SalesDraft::create([
            'store_id' => $this->store->id,
            'user_id'  => $this->user->id,
            'status'   => SalesDraft::STATUS_OPEN,
        ]);
        $oldEmpty->forceFill(['created_at' => now()->subHours(2), 'updated_at' => now()->subHours(2)])->save();

        // Draft sin items, recién creado → NO stale
        $freshEmpty = SalesDraft::create([
            'store_id' => $this->store->id,
            'user_id'  => $this->user->id,
            'status'   => SalesDraft::STATUS_OPEN,
        ]);

        $stale = SalesDraft::stale()->pluck('id')->toArray();

        $this->assertContains($oldEmpty->id, $stale);
        $this->assertNotContains($freshEmpty->id, $stale);
    }

    public function test_bug14_stale_scope_picks_old_drafts_with_items(): void
    {
        $product = $this->makeProduct();

        $stale = SalesDraft::create([
            'store_id' => $this->store->id,
            'user_id'  => $this->user->id,
            'status'   => SalesDraft::STATUS_OPEN,
        ]);
        SalesDraftItem::create([
            'draft_id'   => $stale->id,
            'product_id' => $product->id,
            'quantity'   => 1,
            'price'      => 100,
            'total'      => 100,
        ]);
        // Forzar fechas viejas (>6h sin actividad)
        DB::table('sales_drafts')->where('id', $stale->id)->update([
            'created_at' => now()->subHours(8),
            'updated_at' => now()->subHours(8),
        ]);

        $fresh = SalesDraft::create([
            'store_id' => $this->store->id,
            'user_id'  => $this->user->id,
            'status'   => SalesDraft::STATUS_OPEN,
        ]);
        SalesDraftItem::create([
            'draft_id'   => $fresh->id,
            'product_id' => $product->id,
            'quantity'   => 1,
            'price'      => 100,
            'total'      => 100,
        ]);

        $staleIds = SalesDraft::stale()->pluck('id')->toArray();

        $this->assertContains($stale->id, $staleIds);
        $this->assertNotContains($fresh->id, $staleIds);
    }

    public function test_bug14_cleanup_command_cancels_stale_drafts(): void
    {
        $stale = SalesDraft::create([
            'store_id' => $this->store->id,
            'user_id'  => $this->user->id,
            'status'   => SalesDraft::STATUS_OPEN,
        ]);
        DB::table('sales_drafts')->where('id', $stale->id)->update([
            'created_at' => now()->subHours(2),
            'updated_at' => now()->subHours(2),
        ]);

        Artisan::call('drafts:cleanup');

        $this->assertEquals(
            SalesDraft::STATUS_CANCELLED,
            SalesDraft::find($stale->id)->status,
        );
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private function makeProduct(): \App\Models\Product
    {
        // Necesario para FK warehouses.company_id
        Warehouse::firstOrCreate(
            ['company_id' => $this->company->id, 'name' => 'Bodega Test'],
            ['type' => 'central', 'active' => true],
        );

        return \App\Models\Product::create([
            'company_id' => $this->company->id,
            'name'       => 'Producto Test',
            'sku'        => 'TEST-' . uniqid(),
            'active'     => true,
        ]);
    }
}
