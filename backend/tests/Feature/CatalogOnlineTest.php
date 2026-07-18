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

    public function test_catalogo_global_ordena_mas_nuevo_primero(): void
    {
        Inventory::create(['product_id' => $this->product->id, 'warehouse_id' => $this->warehouseA->id, 'quantity' => 3]);

        $nuevo = Product::create([
            'company_id' => $this->company->id, 'name' => 'AAA Recién llegado', 'sku' => 'SKU-NUEVO', 'active' => true,
        ]);
        $nuevo->price()->create(['price_1' => 100]);
        Inventory::create(['product_id' => $nuevo->id, 'warehouse_id' => $this->warehouseA->id, 'quantity' => 1]);

        // Aunque alfabéticamente iría primero el viejo por nombre, el más
        // NUEVO (id mayor) encabeza el catálogo (v2.2: "lo más nuevo").
        $resp = $this->getJson('/api/v1/public/catalog')->assertOk();
        $resp->assertJsonPath('data.data.0.id', $nuevo->id);
        $resp->assertJsonPath('data.data.1.id', $this->product->id);
    }

    public function test_catalogo_global_expone_promos_vigentes(): void
    {
        Inventory::create(['product_id' => $this->product->id, 'warehouse_id' => $this->warehouseA->id, 'quantity' => 3]);

        \App\Models\ProductPromotion::create([
            'product_id' => $this->product->id, 'store_id' => null,
            'name' => 'Verano 2x1', 'buy_n' => 2, 'pay_m' => 1, 'status' => 'active', 'priority' => 0,
        ]);
        // Pausada y vencida NO deben salir en el payload público.
        \App\Models\ProductPromotion::create([
            'product_id' => $this->product->id, 'store_id' => null,
            'name' => 'Pausada', 'buy_n' => 3, 'pay_m' => 2, 'status' => 'paused', 'priority' => 0,
        ]);
        \App\Models\ProductPromotion::create([
            'product_id' => $this->product->id, 'store_id' => null,
            'name' => 'Vencida', 'buy_n' => 4, 'pay_m' => 3, 'status' => 'active', 'priority' => 0,
            'ends_at' => now()->subDay(),
        ]);

        $resp = $this->getJson('/api/v1/public/catalog')->assertOk();
        $promos = $resp->json('data.data.0.active_promotions');

        $this->assertCount(1, $promos);
        $this->assertSame('Verano 2x1', $promos[0]['name']);
        $this->assertSame(2, $promos[0]['buy_n']);
        $this->assertSame(1, $promos[0]['pay_m']);
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

    // ── Catálogo v5: top manual arrastrable ──────────────────────────────────

    public function test_top_manual_manda_sobre_destacados_y_novedad(): void
    {
        [$viejo, $medio, $nuevo] = $this->makeStockedProducts(3);

        // Sin acomodar: manda la novedad (id desc).
        $this->getJson('/api/v1/public/catalog?sort=featured')
            ->assertOk()
            ->assertJsonPath('data.data.0.id', $nuevo->id);

        // El MÁS VIEJO se destaca y se acomoda primero: debe encabezar aunque
        // sea el id más chico.
        $viejo->forceFill(['featured' => true, 'catalog_position' => 0])->save();
        $medio->forceFill(['featured' => true, 'catalog_position' => 1])->save();

        $resp = $this->getJson('/api/v1/public/catalog?sort=featured')->assertOk();
        $this->assertSame(
            [$viejo->id, $medio->id, $nuevo->id],
            array_column($resp->json('data.data'), 'id'),
            'El top acomodado debe ganarle a destacados y a novedad.'
        );
        $resp->assertJsonPath('data.data.0.catalog_position', 0);
        $resp->assertJsonPath('data.data.2.catalog_position', null);
    }

    public function test_reorder_guarda_posiciones_y_desacomoda_lo_no_enviado(): void
    {
        [$a, $b, $c] = $this->makeStockedProducts(3);
        foreach ([$a, $b, $c] as $p) {
            $p->forceFill(['featured' => true])->save();
        }
        $c->forceFill(['catalog_position' => 0])->save();

        $this->actingAs($this->admin)
            ->putJson('/api/v1/catalog/featured-order', ['order' => [$b->id, $a->id]])
            ->assertOk()
            ->assertJsonPath('data.order', [$b->id, $a->id]);

        $this->assertSame(0, $b->fresh()->catalog_position);
        $this->assertSame(1, $a->fresh()->catalog_position);
        // c no venía en la lista → se desacomoda.
        $this->assertNull($c->fresh()->catalog_position);
    }

    public function test_reorder_ignora_ids_que_ya_no_estan_destacados(): void
    {
        [$a, $b] = $this->makeStockedProducts(2);
        $a->forceFill(['featured' => true])->save();
        // b NO está destacado: simula que otra pestaña le quitó la ★.

        $this->actingAs($this->admin)
            ->putJson('/api/v1/catalog/featured-order', ['order' => [$b->id, $a->id]])
            ->assertOk()
            // Devuelve la lista canónica, sin el que perdió la ★, y re-densificada.
            ->assertJsonPath('data.order', [$a->id]);

        $this->assertSame(0, $a->fresh()->catalog_position);
        $this->assertNull($b->fresh()->catalog_position);
    }

    public function test_quitar_destacado_saca_del_top(): void
    {
        [$p] = $this->makeStockedProducts(1);
        $p->forceFill(['featured' => true, 'catalog_position' => 0])->save();

        $this->actingAs($this->admin)
            ->putJson("/api/v1/catalog/product-flags/{$p->id}", ['featured' => false])
            ->assertOk();

        $this->assertNull($p->fresh()->catalog_position, 'Quitar la ★ debe desacomodar.');
    }

    public function test_reorder_requiere_permiso_de_catalogo(): void
    {
        [$p] = $this->makeStockedProducts(1);
        $p->forceFill(['featured' => true])->save();

        $this->actingAs($this->cajeroA)
            ->putJson('/api/v1/catalog/featured-order', ['order' => [$p->id]])
            ->assertStatus(403);

        $this->assertNull($p->fresh()->catalog_position);
    }

    public function test_paginacion_acumulativa_no_duplica_ni_pierde_con_top_manual(): void
    {
        $products = $this->makeStockedProducts(5);
        // Acomodo cruzado: el 5º primero y el 1º al final del top.
        $products[4]->forceFill(['featured' => true, 'catalog_position' => 0])->save();
        $products[0]->forceFill(['featured' => true, 'catalog_position' => 1])->save();

        $ids = [];
        foreach ([1, 2, 3] as $page) {
            $resp = $this->getJson("/api/v1/public/catalog?sort=featured&per_page=2&page={$page}")->assertOk();
            $ids = array_merge($ids, array_column($resp->json('data.data'), 'id'));
        }

        $this->assertCount(5, $ids);
        $this->assertSame($ids, array_unique($ids), 'Paginar no debe repetir items.');
        $this->assertSame([$products[4]->id, $products[0]->id], array_slice($ids, 0, 2));
    }

    public function test_product_flags_marca_lo_que_no_se_ve_en_la_tienda(): void
    {
        [$conStock] = $this->makeStockedProducts(1);
        // El producto del setUp no tiene inventory → no sale en la tienda.
        $sinStock = $this->product;

        $resp = $this->actingAs($this->admin)
            ->getJson('/api/v1/catalog/product-flags')
            ->assertOk();

        $rows = collect($resp->json('data.data'))->keyBy('id');
        $this->assertTrue($rows[$conStock->id]['in_public_catalog']);
        $this->assertFalse($rows[$sinStock->id]['in_public_catalog']);
    }

    // ── Helper ────────────────────────────────────────────────────────────────

    /** N productos con stock vendible en la tienda A, en orden de id ascendente. */
    private function makeStockedProducts(int $n): array
    {
        $out = [];
        for ($i = 1; $i <= $n; $i++) {
            $p = Product::create([
                'company_id' => $this->company->id,
                'name' => "Producto {$i}", 'sku' => "SKU-TOP-{$i}", 'active' => true,
            ]);
            $p->price()->create(['price_1' => 100 * $i]);
            Inventory::create([
                'product_id' => $p->id, 'warehouse_id' => $this->warehouseA->id, 'quantity' => 5,
            ]);
            $out[] = $p;
        }

        return $out;
    }

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
