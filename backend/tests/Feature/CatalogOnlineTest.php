<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\CatalogProduct;
use App\Models\CatalogSetting;
use App\Models\Company;
use App\Models\Inventory;
use App\Models\Product;
use App\Models\Store;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Tienda Online (catálogo) — Fase carrito + WhatsApp (2026-06-26).
 *
 * Cubre el fix de seguridad (las 6 rutas admin de CatalogController no tenían
 * gate: cualquier token editaba el catálogo de cualquier tienda) y el contrato
 * del endpoint público (whatsapp_number con fallback al teléfono de la tienda,
 * flags de visibilidad, y hide_out_of_stock filtrado en SQL sin romper el total).
 *
 * El permiso es flag-based (can_edit_catalog), espejo de can_view_cost: un
 * gerente SIN el flag no edita aunque sea gerente; el admin siempre puede.
 */
class CatalogOnlineTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;
    private Store $storeA;
    private Store $storeB;
    private Warehouse $warehouseA;
    private User $admin;
    private User $gerenteA;          // sin flag
    private User $gerenteAconFlag;   // can_edit_catalog = true, tienda A
    private User $cajeroA;
    private Product $product;
    private CatalogSetting $settingsA;

    protected function setUp(): void
    {
        parent::setUp();

        $this->company = Company::create(['name' => 'Tadaima Test']);
        $this->storeA = Store::create([
            'company_id' => $this->company->id, 'name' => 'Tienda A',
            'phone' => '6641112233', 'active' => true,
        ]);
        $this->storeB = Store::create([
            'company_id' => $this->company->id, 'name' => 'Tienda B', 'active' => true,
        ]);

        $this->warehouseA = Warehouse::create([
            'company_id' => $this->company->id, 'store_id' => $this->storeA->id,
            'name' => 'Exhibición A', 'type' => 'store', 'active' => true,
        ]);

        $this->admin            = $this->makeUser('admin@test.com', 'admin', null);
        $this->gerenteA         = $this->makeUser('gerente.a@test.com', 'gerente', $this->storeA->id);
        $this->gerenteAconFlag  = $this->makeUser('gerente.flag@test.com', 'gerente', $this->storeA->id, true);
        $this->cajeroA          = $this->makeUser('cajero.a@test.com', 'cajero', $this->storeA->id);

        $this->product = Product::create([
            'company_id' => $this->company->id, 'name' => 'Producto Test', 'sku' => 'SKU-1', 'active' => true,
        ]);
        $this->product->price()->create(['price_1' => 250]);

        $this->settingsA = CatalogSetting::create([
            'store_id' => $this->storeA->id, 'catalog_url' => 'tienda-a',
            'show_price' => true, 'show_stock' => false,
        ]);
        CatalogProduct::create(['product_id' => $this->product->id, 'store_id' => $this->storeA->id, 'visible' => true]);
    }

    // ── Seguridad: gate de los endpoints admin ────────────────────────────────

    public function test_cajero_sin_flag_no_puede_editar_catalogo(): void
    {
        $this->actingAs($this->cajeroA)
            ->putJson("/api/v1/catalog/settings/{$this->storeA->id}", ['show_price' => false])
            ->assertForbidden();

        $this->actingAs($this->cajeroA)
            ->postJson("/api/v1/catalog/products/{$this->storeA->id}", ['product_id' => $this->product->id])
            ->assertForbidden();

        $this->actingAs($this->cajeroA)
            ->deleteJson("/api/v1/catalog/products/{$this->storeA->id}/{$this->product->id}")
            ->assertForbidden();
    }

    public function test_gerente_sin_flag_no_puede_editar_catalogo(): void
    {
        // Flag-based: ser gerente NO basta (espejo de can_view_cost).
        $this->actingAs($this->gerenteA)
            ->putJson("/api/v1/catalog/settings/{$this->storeA->id}", ['whatsapp_number' => '6640001111'])
            ->assertForbidden();
    }

    public function test_gerente_con_flag_puede_editar_su_catalogo(): void
    {
        $this->actingAs($this->gerenteAconFlag)
            ->putJson("/api/v1/catalog/settings/{$this->storeA->id}", ['whatsapp_number' => '6640001111'])
            ->assertOk();

        $this->assertDatabaseHas('catalog_settings', [
            'store_id' => $this->storeA->id, 'whatsapp_number' => '6640001111',
        ]);
    }

    public function test_gerente_con_flag_no_puede_editar_catalogo_de_otra_tienda(): void
    {
        // Tiene el permiso pero su scope es la tienda A → 403 en la tienda B.
        $this->actingAs($this->gerenteAconFlag)
            ->putJson("/api/v1/catalog/settings/{$this->storeB->id}", ['show_price' => false])
            ->assertForbidden();
    }

    public function test_admin_puede_editar_cualquier_catalogo(): void
    {
        $this->actingAs($this->admin)
            ->putJson("/api/v1/catalog/settings/{$this->storeB->id}", ['catalog_url' => 'tienda-b', 'show_stock' => true])
            ->assertOk();
    }

    // ── Contrato del endpoint público ─────────────────────────────────────────

    public function test_public_catalog_expone_whatsapp_y_flags(): void
    {
        $this->settingsA->update([
            'whatsapp_number' => '6649998877',
            'show_search' => true, 'show_categories' => false,
            'show_description' => true, 'cart_enabled' => true, 'hide_out_of_stock' => false,
        ]);

        $resp = $this->getJson('/api/v1/public/catalog/tienda-a')->assertOk();

        $resp->assertJsonPath('data.catalog.whatsapp_number', '6649998877');
        $resp->assertJsonPath('data.catalog.show_categories', false);
        $resp->assertJsonPath('data.catalog.cart_enabled', true);
        // Regresión: los flags originales siguen presentes.
        $resp->assertJsonPath('data.catalog.show_price', true);
        $resp->assertJsonPath('data.catalog.show_stock', false);
    }

    public function test_public_catalog_whatsapp_fallback_al_telefono_de_la_tienda(): void
    {
        // Sin whatsapp_number en settings → usa el phone de la sucursal.
        $this->getJson('/api/v1/public/catalog/tienda-a')
            ->assertOk()
            ->assertJsonPath('data.catalog.whatsapp_number', '6641112233');
    }

    public function test_public_catalog_respeta_show_price(): void
    {
        // show_price = true → el item trae price.
        $this->getJson('/api/v1/public/catalog/tienda-a')
            ->assertOk()
            ->assertJsonPath('data.data.0.price', 250);

        // show_price = false → sin price.
        $this->settingsA->update(['show_price' => false]);
        $resp = $this->getJson('/api/v1/public/catalog/tienda-a')->assertOk();
        $this->assertArrayNotHasKey('price', $resp->json('data.data.0'));
    }

    public function test_hide_out_of_stock_excluye_agotados_y_ajusta_total(): void
    {
        // product (setUp) sin inventory = agotado. Agrego uno con stock.
        $enStock = Product::create([
            'company_id' => $this->company->id, 'name' => 'Con Stock', 'sku' => 'SKU-2', 'active' => true,
        ]);
        $enStock->price()->create(['price_1' => 99]);
        CatalogProduct::create(['product_id' => $enStock->id, 'store_id' => $this->storeA->id, 'visible' => true]);
        Inventory::create(['product_id' => $enStock->id, 'warehouse_id' => $this->warehouseA->id, 'quantity' => 4]);

        // Sin filtro: ambos productos.
        $this->getJson('/api/v1/public/catalog/tienda-a')
            ->assertOk()
            ->assertJsonPath('data.pagination.total', 2);

        // Con hide_out_of_stock: solo el que tiene stock, y total lo refleja.
        $this->settingsA->update(['hide_out_of_stock' => true, 'show_stock' => true]);
        $resp = $this->getJson('/api/v1/public/catalog/tienda-a')->assertOk();
        $resp->assertJsonPath('data.pagination.total', 1);
        $resp->assertJsonPath('data.data.0.id', $enStock->id);
        $resp->assertJsonPath('data.data.0.stock', 4);
    }

    public function test_public_catalog_404_en_url_invalida(): void
    {
        $this->getJson('/api/v1/public/catalog/no-existe')->assertNotFound();
    }

    // ── Permiso: plumbing y unit ──────────────────────────────────────────────

    public function test_user_resource_expone_can_edit_catalog_y_admin_lo_setea(): void
    {
        $this->actingAs($this->admin)
            ->putJson("/api/v1/users/{$this->gerenteA->id}", ['can_edit_catalog' => true])
            ->assertOk()
            ->assertJsonPath('data.can_edit_catalog', true);

        $this->assertDatabaseHas('users', ['id' => $this->gerenteA->id, 'can_edit_catalog' => true]);
    }

    public function test_can_edit_catalog_helper(): void
    {
        $this->assertTrue($this->admin->canEditCatalog(), 'admin siempre puede');
        $this->assertTrue($this->gerenteAconFlag->canEditCatalog(), 'gerente con flag puede');
        $this->assertFalse($this->gerenteA->canEditCatalog(), 'gerente sin flag no puede');
    }

    // ── v2: catálogo global por inventario ────────────────────────────────────

    public function test_catalogo_global_desglosa_stock_por_tienda(): void
    {
        $whB = Warehouse::create([
            'company_id' => $this->company->id, 'store_id' => $this->storeB->id,
            'name' => 'Exhibición B', 'type' => 'store', 'active' => true,
        ]);
        Inventory::create(['product_id' => $this->product->id, 'warehouse_id' => $this->warehouseA->id, 'quantity' => 3]);
        Inventory::create(['product_id' => $this->product->id, 'warehouse_id' => $whB->id, 'quantity' => 2]);

        $resp = $this->getJson('/api/v1/public/catalog')->assertOk();

        $resp->assertJsonPath('data.data.0.id', $this->product->id);
        $resp->assertJsonPath('data.data.0.total', 5);
        $this->assertCount(2, $resp->json('data.data.0.stores'));
        $resp->assertJsonPath('data.catalog.cart_enabled', true); // flags globales con default
    }

    public function test_catalogo_global_excluye_productos_sin_stock(): void
    {
        // El producto del setUp no tiene inventory → no aparece.
        $this->getJson('/api/v1/public/catalog')
            ->assertOk()
            ->assertJsonPath('data.pagination.total', 0);
    }

    public function test_catalogo_global_whatsapp_por_tienda_fallback_phone(): void
    {
        Inventory::create(['product_id' => $this->product->id, 'warehouse_id' => $this->warehouseA->id, 'quantity' => 1]);

        // storeA: settings sin whatsapp → fallback a stores.phone ('6641112233').
        $resp = $this->getJson('/api/v1/public/catalog')->assertOk();
        $stores = collect($resp->json('data.data.0.stores'));
        $entry = $stores->firstWhere('store_id', $this->storeA->id);
        $this->assertSame('6641112233', $entry['whatsapp']);
    }

    public function test_whatsapp_vacio_se_normaliza_a_null_al_guardar(): void
    {
        // Hardening: WhatsApp "" no debe romper el guardado (antes 422 por el regex).
        $this->actingAs($this->admin)
            ->putJson("/api/v1/catalog/settings/{$this->storeA->id}", ['whatsapp_number' => ''])
            ->assertOk();

        $this->assertDatabaseHas('catalog_settings', [
            'store_id' => $this->storeA->id, 'whatsapp_number' => null,
        ]);
    }

    public function test_puede_reguardar_settings_con_su_mismo_slug(): void
    {
        // Bug latente: la regla unique debe excluir el propio registro de la
        // tienda. Re-guardar con el mismo slug (editar otra cosa) NO debe dar 422.
        $this->actingAs($this->admin)
            ->putJson("/api/v1/catalog/settings/{$this->storeB->id}", ['catalog_url' => 'tienda-b'])
            ->assertOk();

        $this->actingAs($this->admin)
            ->putJson("/api/v1/catalog/settings/{$this->storeB->id}", ['catalog_url' => 'tienda-b', 'show_price' => false])
            ->assertOk();
    }

    public function test_slug_duplicado_de_otra_tienda_si_se_rechaza(): void
    {
        // storeA ya tiene 'tienda-a' (setUp). storeB no puede tomarlo.
        $this->actingAs($this->admin)
            ->putJson("/api/v1/catalog/settings/{$this->storeB->id}", ['catalog_url' => 'tienda-a'])
            ->assertStatus(422);
    }

    // ── Helper ────────────────────────────────────────────────────────────────

    private function makeUser(string $email, string $roleName, ?int $storeId, bool $canEditCatalog = false): User
    {
        $user = User::create([
            'name' => $email, 'email' => $email, 'password' => bcrypt('password'),
            'company_id' => $this->company->id, 'store_id' => $storeId, 'active' => true,
            'can_edit_catalog' => $canEditCatalog,
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
}
