<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Inventory;
use App\Models\Product;
use App\Models\Store;
use App\Models\SystemSetting;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Catálogo Online v3 (2026-07-17) — configuración global del catálogo de
 * cadena: appearance (tema/redes/descripción), footer con sucursales,
 * flags por producto (featured / catalog_visible), orden "destacados" y
 * hardening de escritura de llaves catalog_* en /settings.
 */
class CatalogConfigTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;
    private Store $storeA;
    private Warehouse $warehouseA;
    private User $admin;
    private User $gerenteSinFlag;
    private User $gerenteConFlag;
    private User $cajero;
    private Product $product;

    protected function setUp(): void
    {
        parent::setUp();

        $this->company = Company::create(['name' => 'Tadaima Test']);
        $this->storeA = Store::create([
            'company_id' => $this->company->id, 'name' => 'Tienda A',
            'address' => 'Av. Revolución 123', 'phone' => '6641112233', 'active' => true,
        ]);
        $this->warehouseA = Warehouse::create([
            'company_id' => $this->company->id, 'store_id' => $this->storeA->id,
            'name' => 'Exhibición A', 'type' => 'store', 'active' => true,
        ]);

        $this->admin          = $this->makeUser('admin@test.com', 'admin', null);
        $this->gerenteSinFlag = $this->makeUser('gerente@test.com', 'gerente', $this->storeA->id);
        $this->gerenteConFlag = $this->makeUser('gerente.flag@test.com', 'gerente', $this->storeA->id, true);
        $this->cajero         = $this->makeUser('cajero@test.com', 'cajero', $this->storeA->id);

        $this->product = $this->makeProductWithStock('Producto Base', 'SKU-BASE');
    }

    // ── Defaults y overrides del bloque appearance/footer ────────────────────

    public function test_public_catalog_defaults_sin_kv(): void
    {
        $resp = $this->getJson('/api/v1/public/catalog')->assertOk()->json('data');

        $this->assertSame('new', $resp['catalog']['default_sort']);
        $this->assertSame('tadaima', $resp['appearance']['theme']);
        $this->assertSame([], (array) $resp['appearance']['socials']);
        $this->assertNull($resp['appearance']['description']);
        $this->assertTrue($resp['footer']['show_stores']);
        $this->assertTrue($resp['footer']['show_address']);
        $this->assertTrue($resp['footer']['show_contact']);
        $this->assertCount(1, $resp['footer']['stores']);
        $this->assertSame('Av. Revolución 123', $resp['footer']['stores'][0]['address']);
        $this->assertSame('6641112233', $resp['footer']['stores'][0]['phone']);
    }

    public function test_theme_valido_se_respeta_e_invalido_degrada_a_tadaima(): void
    {
        $this->setKv('catalog_theme', 'navidad');
        $this->assertSame('navidad', $this->getJson('/api/v1/public/catalog')->json('data.appearance.theme'));

        $this->setKv('catalog_theme', 'tema-pirata');
        $this->assertSame('tadaima', $this->getJson('/api/v1/public/catalog')->json('data.appearance.theme'));
    }

    public function test_socials_json_valido_decodifica_y_corrupto_degrada(): void
    {
        $this->setKv('catalog_socials', json_encode([
            'instagram' => 'https://instagram.com/tadaima',
            'x'         => 'https://x.com/tadaima',
            'desconocida' => 'https://spam.com', // llave no soportada → fuera
            'facebook'  => '   ',                 // vacía → fuera
        ]));

        $socials = (array) $this->getJson('/api/v1/public/catalog')->json('data.appearance.socials');
        $this->assertSame([
            'instagram' => 'https://instagram.com/tadaima',
            'x'         => 'https://x.com/tadaima',
        ], $socials);

        // JSON corrupto NO debe tumbar el endpoint público.
        $this->setKv('catalog_socials', '{esto no es json');
        $resp = $this->getJson('/api/v1/public/catalog')->assertOk();
        $this->assertSame([], (array) $resp->json('data.appearance.socials'));
    }

    public function test_footer_respeta_toggles_de_address_y_stores(): void
    {
        $this->setKv('catalog_show_address', 'false');
        $stores = $this->getJson('/api/v1/public/catalog')->json('data.footer.stores');
        $this->assertNull($stores[0]['address']);
        $this->assertSame('6641112233', $stores[0]['phone']);

        $this->setKv('catalog_show_stores', 'false');
        $footer = $this->getJson('/api/v1/public/catalog')->json('data.footer');
        $this->assertFalse($footer['show_stores']);
        $this->assertSame([], $footer['stores']);
    }

    // ── Flags por producto en el catálogo público ────────────────────────────

    public function test_producto_oculto_no_sale_en_catalogo_publico(): void
    {
        $oculto = $this->makeProductWithStock('Oculto', 'SKU-OCULTO');
        $oculto->update(['catalog_visible' => false]);

        $ids = collect($this->getJson('/api/v1/public/catalog')->json('data.data'))->pluck('id');
        $this->assertTrue($ids->contains($this->product->id));
        $this->assertFalse($ids->contains($oculto->id));
    }

    public function test_featured_se_expone_y_sort_featured_lo_antepone(): void
    {
        // product base (id menor) destacado; nuevo (id mayor) normal.
        $this->product->update(['featured' => true]);
        $nuevo = $this->makeProductWithStock('Más Nuevo', 'SKU-NUEVO');

        // Orden default: novedad (id desc) → el nuevo va primero.
        $data = $this->getJson('/api/v1/public/catalog')->json('data.data');
        $this->assertSame($nuevo->id, $data[0]['id']);
        $this->assertFalse($data[0]['featured']);
        $this->assertTrue(collect($data)->firstWhere('id', $this->product->id)['featured']);

        // sort=featured: el destacado (id menor) gana.
        $data = $this->getJson('/api/v1/public/catalog?sort=featured')->json('data.data');
        $this->assertSame($this->product->id, $data[0]['id']);
    }

    // ── Endpoints admin de product-flags ─────────────────────────────────────

    public function test_admin_actualiza_flags_y_solo_lo_enviado(): void
    {
        $this->actingAs($this->admin)
            ->putJson("/api/v1/catalog/product-flags/{$this->product->id}", ['featured' => true])
            ->assertOk();

        $this->assertDatabaseHas('products', [
            'id' => $this->product->id, 'featured' => 1, 'catalog_visible' => 1, // visible intacto
        ]);
    }

    public function test_product_flags_rbac(): void
    {
        $payload = ['catalog_visible' => false];
        $url = "/api/v1/catalog/product-flags/{$this->product->id}";

        $this->actingAs($this->gerenteConFlag)->putJson($url, $payload)->assertOk();
        $this->actingAs($this->gerenteSinFlag)->putJson($url, $payload)->assertForbidden();
        $this->actingAs($this->cajero)->putJson($url, $payload)->assertForbidden();
        $this->actingAs($this->cajero)->getJson('/api/v1/catalog/product-flags')->assertForbidden();

        // Body vacío → 422 (no hay nada que actualizar).
        $this->actingAs($this->admin)->putJson($url, [])->assertUnprocessable();
    }

    public function test_product_flags_lista_filtra_y_busca(): void
    {
        $this->product->update(['featured' => true]);
        $oculto = $this->makeProductWithStock('Oculto Lista', 'SKU-OCL');
        $oculto->update(['catalog_visible' => false]);

        $featured = $this->actingAs($this->admin)
            ->getJson('/api/v1/catalog/product-flags?filter=featured')->assertOk()->json('data.data');
        $this->assertSame([$this->product->id], collect($featured)->pluck('id')->all());

        $hidden = $this->actingAs($this->admin)
            ->getJson('/api/v1/catalog/product-flags?filter=hidden')->json('data.data');
        $this->assertSame([$oculto->id], collect($hidden)->pluck('id')->all());

        $bySku = $this->actingAs($this->admin)
            ->getJson('/api/v1/catalog/product-flags?search=SKU-OCL')->json('data.data');
        $this->assertSame([$oculto->id], collect($bySku)->pluck('id')->all());
    }

    // ── Hardening de /settings para llaves catalog_* ─────────────────────────

    public function test_cajero_no_puede_escribir_llaves_catalog(): void
    {
        $this->actingAs($this->cajero)
            ->putJson('/api/v1/settings', ['catalog_theme' => 'navidad'])
            ->assertForbidden();

        $this->assertDatabaseMissing('system_settings', ['key' => 'catalog_theme']);

        // Single-key también gateado.
        $this->actingAs($this->cajero)
            ->putJson('/api/v1/settings/catalog_theme', ['value' => 'navidad'])
            ->assertForbidden();
    }

    public function test_admin_si_escribe_llaves_catalog_y_cajero_conserva_otras(): void
    {
        $this->actingAs($this->admin)
            ->putJson('/api/v1/settings', ['catalog_theme' => 'muertos'])
            ->assertOk();
        $this->assertDatabaseHas('system_settings', ['key' => 'catalog_theme', 'value' => 'muertos']);

        // Llave NO catalog_* conserva el comportamiento actual (sin gate nuevo).
        $this->actingAs($this->cajero)
            ->putJson('/api/v1/settings', ['ui_pref_demo' => '1'])
            ->assertOk();
    }

    public function test_batch_rechaza_valores_gigantes(): void
    {
        $this->actingAs($this->admin)
            ->putJson('/api/v1/settings', ['catalog_description' => str_repeat('x', 5001)])
            ->assertUnprocessable();
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    private function setKv(string $key, string $value): void
    {
        SystemSetting::updateOrCreate(
            ['company_id' => $this->company->id, 'key' => $key],
            ['value' => $value]
        );
    }

    private function makeProductWithStock(string $name, string $sku): Product
    {
        $p = Product::create([
            'company_id' => $this->company->id, 'name' => $name, 'sku' => $sku, 'active' => true,
        ]);
        $p->price()->create(['price_1' => 100]);
        Inventory::create(['product_id' => $p->id, 'warehouse_id' => $this->warehouseA->id, 'quantity' => 5]);

        return $p;
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
