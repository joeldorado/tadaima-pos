<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Inventory;
use App\Models\Product;
use App\Models\ProductImage;
use App\Models\Store;
use App\Models\UsListing;
use App\Models\UsOrder;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * TadaimaUS — contrato completo de la tienda US:
 *
 *  Público:  GET /us/catalog (solo visible=true, filtros category/search,
 *            image_url con fallback a la foto del producto) y
 *            POST /us/orders (precios SIEMPRE del server, snapshot en items,
 *            folio TUS-000001 secuencial).
 *  Admin:    CRUD /us/listings (duplicado 422), /us/products (excluye ya
 *            listados) y GET /us/orders — todo solo-admin (adminOnlyError).
 */
class UsStoreTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;
    private Store $store;
    private Warehouse $warehouse;
    private User $admin;
    private User $gerente;
    private User $cajero;

    protected function setUp(): void
    {
        parent::setUp();

        $this->company = Company::create(['name' => 'Tadaima Test']);
        $this->store = Store::create([
            'company_id' => $this->company->id, 'name' => 'Tienda A', 'active' => true,
        ]);
        // Bodega vendible (Exhibición): SellableStock solo cuenta type='store'.
        $this->warehouse = Warehouse::create([
            'company_id' => $this->company->id, 'store_id' => $this->store->id,
            'name' => 'Exhibición A', 'type' => 'store', 'active' => true,
        ]);

        $this->admin   = $this->makeUser('admin@test.com', 'admin', null);
        $this->gerente = $this->makeUser('gerente@test.com', 'gerente', $this->store->id);
        $this->cajero  = $this->makeUser('cajero@test.com', 'cajero', $this->store->id);
    }

    // ── Catálogo público ──────────────────────────────────────────────────────

    public function test_catalogo_publico_solo_muestra_visibles(): void
    {
        $visible = $this->makeListing($this->makeProduct('Funko Pop Rengoku', 'FIG-001'), [
            'name' => 'Rengoku Funko Pop', 'price_usd' => 25, 'category' => 'figures',
        ]);
        $this->makeListing($this->makeProduct('Booster Box OP-13', 'TCG-001'), [
            'name' => 'One Piece OP-13 Booster Box', 'price_usd' => 120,
            'category' => 'tcg', 'visible' => false,
        ]);

        $resp = $this->getJson('/api/v1/us/catalog')->assertOk();

        $resp->assertJsonCount(1, 'data');
        $resp->assertJsonPath('data.0.id', $visible->id);
        $resp->assertJsonPath('data.0.name', 'Rengoku Funko Pop');
        // Contrato: price_usd como string "25.00".
        $resp->assertJsonPath('data.0.price_usd', '25.00');
        $resp->assertJsonPath('data.0.category', 'figures');
        $this->assertStringNotContainsString('OP-13', $resp->getContent());
    }

    public function test_catalogo_filtra_por_categoria_y_search(): void
    {
        $figura = $this->makeListing($this->makeProduct('Funko Rengoku', 'FIG-001'), [
            'name' => 'Rengoku Figure', 'category' => 'figures',
        ]);
        $manga = $this->makeListing($this->makeProduct('JJK Vol 1', 'MAN-001'), [
            'name' => 'Jujutsu Kaisen Vol. 1', 'category' => 'manga',
        ]);

        $this->getJson('/api/v1/us/catalog?category=manga')->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $manga->id);

        $this->getJson('/api/v1/us/catalog?search=rengoku')->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $figura->id);
    }

    public function test_catalogo_image_url_del_listing_con_fallback_a_foto_del_producto(): void
    {
        // Sin image_url propio → cae a la primera foto del producto.
        $conFoto = $this->makeProduct('Lugia EX', 'TCG-010');
        ProductImage::create([
            'product_id' => $conFoto->id, 'image_path' => 'products/lugia.jpg', 'sort_order' => 0,
        ]);
        $fallback = $this->makeListing($conFoto, ['name' => 'Lugia EX Premium']);

        // Con image_url propio → gana el del listing.
        $propio = $this->makeListing($this->makeProduct('Turbo Granny', 'FIG-020'), [
            'name' => 'Turbo Granny Backpack',
            'image_url' => 'https://static.wixstatic.com/media/granny.png',
        ]);

        $resp = $this->getJson('/api/v1/us/catalog')->assertOk();
        $rows = collect($resp->json('data'))->keyBy('id');

        $this->assertStringContainsString('products/lugia.jpg', $rows[$fallback->id]['image_url']);
        $this->assertSame('https://static.wixstatic.com/media/granny.png', $rows[$propio->id]['image_url']);
    }

    public function test_catalogo_oculta_listings_de_productos_sin_stock_vendible(): void
    {
        // Decisión de Joel (plan TadaimaUS): producto publicado se OCULTA si se
        // agota. Criterio único: SellableStock (SUM > 0 en bodegas type='store').
        $conStock = $this->makeListing($this->makeProduct('Funko Rengoku', 'FIG-001'), [
            'name' => 'Rengoku Figure',
        ]);
        $this->makeListing($this->makeProduct('Booster OP-13', 'TCG-001', stock: 0), [
            'name' => 'One Piece OP-13 Booster Box',
        ]);

        // Stock SOLO en bodega trasera (type='bodega') ≠ vendible.
        $trasera = Warehouse::create([
            'company_id' => $this->company->id, 'store_id' => $this->store->id,
            'name' => 'Bodega A', 'type' => 'bodega', 'active' => true,
        ]);
        $soloBodega = $this->makeProduct('Nendoroid Miku', 'FIG-002', stock: 0);
        Inventory::create([
            'product_id' => $soloBodega->id, 'warehouse_id' => $trasera->id, 'quantity' => 9,
        ]);
        $this->makeListing($soloBodega, ['name' => 'Nendoroid Hatsune Miku']);

        $resp = $this->getJson('/api/v1/us/catalog')->assertOk();

        $resp->assertJsonCount(1, 'data');
        $resp->assertJsonPath('data.0.id', $conStock->id);
    }

    // ── Pedidos públicos (checkout dummy) ─────────────────────────────────────

    public function test_orden_ignora_precios_del_cliente_y_congela_snapshot(): void
    {
        $a = $this->makeListing($this->makeProduct('Funko Rengoku', 'FIG-001'), [
            'name' => 'Rengoku Figure', 'price_usd' => 12.50,
        ]);
        $b = $this->makeListing($this->makeProduct('Booster OP-13', 'TCG-001'), [
            'name' => 'OP-13 Booster Box', 'price_usd' => 40,
        ]);

        $resp = $this->postJson('/api/v1/us/orders', [
            'name'  => 'John Doe',
            'email' => 'john@example.com',
            'phone' => '+1 619 555 0100',
            // Precios/total falsos del cliente → el server los IGNORA.
            'total_usd' => 0.01,
            'items' => [
                ['listing_id' => $a->id, 'quantity' => 2, 'price_usd' => 0.01, 'price' => 0.01],
                ['listing_id' => $b->id, 'quantity' => 1, 'price_usd' => 1],
            ],
        ])->assertCreated();

        // Total server-side: 12.50×2 + 40×1 = 65.00 (jamás 0.01).
        $resp->assertJsonPath('success', true);
        $resp->assertJsonPath('data.total_usd', '65.00');

        $order = UsOrder::query()->latest('id')->firstOrFail();

        // Folio TUS-000001: secuencial por id, 6 dígitos.
        $expected = 'TUS-' . str_pad((string) $order->id, 6, '0', STR_PAD_LEFT);
        $resp->assertJsonPath('data.order_number', $expected);
        $this->assertMatchesRegularExpression('/^TUS-\d{6}$/', $order->order_number);

        $this->assertDatabaseHas('us_orders', [
            'id' => $order->id, 'customer_email' => 'john@example.com',
            'status' => 'new', 'total_usd' => 65.00,
        ]);
        $this->assertDatabaseHas('us_order_items', [
            'us_order_id' => $order->id, 'us_listing_id' => $a->id,
            'name' => 'Rengoku Figure', 'price_usd' => 12.50,
            'quantity' => 2, 'line_total_usd' => 25.00,
        ]);
        $this->assertDatabaseHas('us_order_items', [
            'us_order_id' => $order->id, 'us_listing_id' => $b->id,
            'price_usd' => 40.00, 'quantity' => 1, 'line_total_usd' => 40.00,
        ]);

        // Editar el listing DESPUÉS no altera el snapshot del pedido.
        $a->update(['price_usd' => 99, 'name' => 'Renombrado']);
        $this->assertDatabaseHas('us_order_items', [
            'us_order_id' => $order->id, 'us_listing_id' => $a->id,
            'name' => 'Rengoku Figure', 'price_usd' => 12.50,
        ]);

        // Segundo pedido → folio consecutivo.
        $resp2 = $this->postJson('/api/v1/us/orders', [
            'name' => 'Jane Roe', 'email' => 'jane@example.com', 'phone' => '+1 619 555 0101',
            'items' => [['listing_id' => $b->id, 'quantity' => 1]],
        ])->assertCreated();
        $siguiente = 'TUS-' . str_pad((string) ($order->id + 1), 6, '0', STR_PAD_LEFT);
        $resp2->assertJsonPath('data.order_number', $siguiente);
    }

    public function test_orden_validaciones(): void
    {
        $listing = $this->makeListing($this->makeProduct('Funko', 'FIG-001'), ['price_usd' => 10]);

        // Email malo → 422 con envelope de error.
        $this->postJson('/api/v1/us/orders', [
            'name' => 'John', 'email' => 'no-es-email', 'phone' => '+1 619 555 0100',
            'items' => [['listing_id' => $listing->id, 'quantity' => 1]],
        ])->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonStructure(['errors' => ['email']]);

        // Items vacíos → 422.
        $this->postJson('/api/v1/us/orders', [
            'name' => 'John', 'email' => 'john@example.com', 'phone' => '+1 619 555 0100',
            'items' => [],
        ])->assertStatus(422)->assertJsonPath('success', false);

        // Listing invisible → 422 (misma respuesta que inexistente: no filtra info).
        $oculto = $this->makeListing($this->makeProduct('Oculto', 'FIG-002'), [
            'visible' => false,
        ]);
        $this->postJson('/api/v1/us/orders', [
            'name' => 'John', 'email' => 'john@example.com', 'phone' => '+1 619 555 0100',
            'items' => [['listing_id' => $oculto->id, 'quantity' => 1]],
        ])->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath('error', 'One or more items are no longer available.');

        // Listing inexistente → 422.
        $this->postJson('/api/v1/us/orders', [
            'name' => 'John', 'email' => 'john@example.com', 'phone' => '+1 619 555 0100',
            'items' => [['listing_id' => 999999, 'quantity' => 1]],
        ])->assertStatus(422)->assertJsonPath('success', false);

        $this->assertDatabaseCount('us_orders', 0);
    }

    // ── Agotado manual (sold_out) ─────────────────────────────────────────────

    public function test_catalogo_publico_expone_sold_out(): void
    {
        // A diferencia del sin-stock POS (que se OCULTA), el agotado manual SÍ
        // sale en el catálogo — la tienda pinta "Sold Out" y bloquea la compra.
        $agotado = $this->makeListing($this->makeProduct('Funko Rengoku', 'FIG-001'), [
            'name' => 'Rengoku Figure', 'sold_out' => true,
        ]);
        $normal = $this->makeListing($this->makeProduct('Booster OP-13', 'TCG-001'), [
            'name' => 'OP-13 Booster Box',
        ]);

        $resp = $this->getJson('/api/v1/us/catalog')->assertOk();
        $rows = collect($resp->json('data'))->keyBy('id');

        $this->assertCount(2, $rows);
        $this->assertTrue($rows[$agotado->id]['sold_out']);
        $this->assertFalse($rows[$normal->id]['sold_out']);

        // El filtro de stock NO cambió: sin stock POS sigue oculto por
        // completo, aunque además esté marcado sold_out.
        $this->makeListing($this->makeProduct('Sin Stock', 'FIG-099', stock: 0), [
            'name' => 'Producto Sin Stock', 'sold_out' => true,
        ]);
        $this->getJson('/api/v1/us/catalog?search=sin stock')->assertOk()
            ->assertJsonCount(0, 'data');
    }

    public function test_orden_rechaza_items_sold_out_con_rollback_total(): void
    {
        $normal = $this->makeListing($this->makeProduct('Funko', 'FIG-001'), [
            'name' => 'Rengoku Figure', 'price_usd' => 25,
        ]);
        $agotado = $this->makeListing($this->makeProduct('Booster', 'TCG-001'), [
            'name' => 'OP-13 Booster Box', 'price_usd' => 120, 'sold_out' => true,
        ]);

        // Pedido mixto (1 normal + 1 agotado) → 422 con mensaje claro y CERO
        // pedidos/items creados (rollback total).
        $this->postJson('/api/v1/us/orders', [
            'name' => 'John', 'email' => 'john@example.com', 'phone' => '+1 619 555 0100',
            'items' => [
                ['listing_id' => $normal->id, 'quantity' => 1],
                ['listing_id' => $agotado->id, 'quantity' => 1],
            ],
        ])->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath('error', '"OP-13 Booster Box" is sold out and can no longer be ordered.');

        $this->assertDatabaseCount('us_orders', 0);
        $this->assertDatabaseCount('us_order_items', 0);

        // Al desmarcar, la compra procede normal.
        $agotado->update(['sold_out' => false]);
        $this->postJson('/api/v1/us/orders', [
            'name' => 'John', 'email' => 'john@example.com', 'phone' => '+1 619 555 0100',
            'items' => [['listing_id' => $agotado->id, 'quantity' => 1]],
        ])->assertCreated();
    }

    public function test_admin_marca_y_desmarca_sold_out(): void
    {
        $listing = $this->makeListing($this->makeProduct('Funko', 'FIG-001'), [
            'name' => 'Rengoku Figure',
        ]);

        // Default: false, expuesto en el index.
        $this->actingAs($this->admin)->getJson('/api/v1/us/listings')->assertOk()
            ->assertJsonPath('data.0.sold_out', false);

        // Toggle ON / OFF vía update.
        $this->actingAs($this->admin)->putJson("/api/v1/us/listings/{$listing->id}", [
            'sold_out' => true,
        ])->assertOk()->assertJsonPath('data.sold_out', true);
        $this->assertDatabaseHas('us_listings', ['id' => $listing->id, 'sold_out' => true]);

        $this->actingAs($this->admin)->putJson("/api/v1/us/listings/{$listing->id}", [
            'sold_out' => false,
        ])->assertOk()->assertJsonPath('data.sold_out', false);

        // CREATE custom ya agotado; sin el campo → default false.
        $this->actingAs($this->admin)->postJson('/api/v1/us/listings', [
            'name' => 'Custom Agotado', 'price_usd' => 15, 'category' => 'other',
            'sold_out' => true,
        ])->assertCreated()->assertJsonPath('data.sold_out', true);
        $this->actingAs($this->admin)->postJson('/api/v1/us/listings', [
            'name' => 'Custom Normal', 'price_usd' => 15, 'category' => 'other',
        ])->assertCreated()->assertJsonPath('data.sold_out', false);
    }

    // ── Admin: CRUD de listings ───────────────────────────────────────────────

    public function test_admin_crud_de_listings(): void
    {
        $product = $this->makeProduct('Funko Pop Rengoku', 'FIG-001');

        // CREATE
        $resp = $this->actingAs($this->admin)->postJson('/api/v1/us/listings', [
            'product_id'  => $product->id,
            'name'        => 'Rengoku Funko Pop',
            'description' => 'Demon Slayer Hashira figure',
            'price_usd'   => 29.99,
            'category'    => 'figures',
        ])->assertCreated();
        $resp->assertJsonPath('data.name', 'Rengoku Funko Pop');
        $resp->assertJsonPath('data.price_usd', '29.99');
        $resp->assertJsonPath('data.visible', true);
        $resp->assertJsonPath('data.product.sku', 'FIG-001');
        $listingId = $resp->json('data.id');

        // Categoría inválida → 422.
        $this->actingAs($this->admin)->postJson('/api/v1/us/listings', [
            'product_id' => $this->makeProduct('Otro', 'SKU-X')->id,
            'name' => 'X', 'price_usd' => 5, 'category' => 'electronics',
        ])->assertStatus(422);

        // INDEX con search por nombre/sku del producto.
        $this->actingAs($this->admin)->getJson('/api/v1/us/listings?search=FIG-001')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $listingId)
            ->assertJsonPath('data.0.product.name', 'Funko Pop Rengoku');

        // UPDATE (campos opcionales).
        $this->actingAs($this->admin)->putJson("/api/v1/us/listings/{$listingId}", [
            'price_usd' => 34.50, 'visible' => false,
        ])->assertOk()
            ->assertJsonPath('data.price_usd', '34.50')
            ->assertJsonPath('data.visible', false);
        $this->assertDatabaseHas('us_listings', [
            'id' => $listingId, 'price_usd' => 34.50, 'visible' => false,
        ]);

        // DELETE
        $this->actingAs($this->admin)->deleteJson("/api/v1/us/listings/{$listingId}")
            ->assertOk();
        $this->assertDatabaseMissing('us_listings', ['id' => $listingId]);
    }

    public function test_listings_admin_exponen_in_stock(): void
    {
        // El panel del admin muestra POR QUÉ un listing no sale en la tienda:
        // in_stock=false ⇒ "Sin stock — oculto en la tienda" (PublishedPanel).
        $disponible = $this->makeListing($this->makeProduct('Funko Rengoku', 'FIG-001'), [
            'name' => 'Rengoku Figure',
        ]);
        $agotado = $this->makeListing($this->makeProduct('Booster OP-13', 'TCG-001', stock: 0), [
            'name' => 'One Piece OP-13 Booster Box',
        ]);

        $resp = $this->actingAs($this->admin)->getJson('/api/v1/us/listings')->assertOk();
        $rows = collect($resp->json('data'))->keyBy('id');

        $this->assertTrue($rows[$disponible->id]['in_stock']);
        $this->assertFalse($rows[$agotado->id]['in_stock']);

        // CREATE y UPDATE también responden in_stock (la UI refresca optimista).
        $nuevo = $this->makeProduct('Nendoroid Miku', 'FIG-002', stock: 0);
        $this->actingAs($this->admin)->postJson('/api/v1/us/listings', [
            'product_id' => $nuevo->id, 'name' => 'Nendoroid Hatsune Miku',
            'price_usd' => 54.99, 'category' => 'figures',
        ])->assertCreated()->assertJsonPath('data.in_stock', false);

        $this->actingAs($this->admin)->putJson("/api/v1/us/listings/{$disponible->id}", [
            'price_usd' => 12.00,
        ])->assertOk()->assertJsonPath('data.in_stock', true);
    }

    public function test_producto_duplicado_rechazado(): void
    {
        $product = $this->makeProduct('Funko', 'FIG-001');
        $this->makeListing($product);

        $this->actingAs($this->admin)->postJson('/api/v1/us/listings', [
            'product_id' => $product->id, 'name' => 'Duplicado',
            'price_usd' => 10, 'category' => 'other',
        ])->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath('error', 'Este producto ya está publicado en TadaimaUS.');

        $this->assertDatabaseCount('us_listings', 1);
    }

    // ── Listings CUSTOM (sin producto POS: Wix migrado / dummy del panel) ─────

    public function test_listing_custom_sin_product_id(): void
    {
        // CREATE custom: exige name (no hay producto de dónde caer).
        $this->actingAs($this->admin)->postJson('/api/v1/us/listings', [
            'price_usd' => 20, 'category' => 'figures',
        ])->assertStatus(422)->assertJsonStructure(['errors' => ['name']]);

        $resp = $this->actingAs($this->admin)->postJson('/api/v1/us/listings', [
            'name'      => 'Mometria Dio',
            'price_usd' => 37,
            'category'  => 'figures',
            'image_url' => 'us-img/products/mometria-dio.jpg',
        ])->assertCreated();
        $resp->assertJsonPath('data.is_custom', true);
        $resp->assertJsonPath('data.product', null);
        // Custom no depende de stock POS: el panel lo muestra disponible.
        $resp->assertJsonPath('data.in_stock', true);
        $customId = $resp->json('data.id');

        // Catálogo público: sale SIN stock POS y con URL absoluta de us-img/.
        $catalog = $this->getJson('/api/v1/us/catalog')->assertOk();
        $rows = collect($catalog->json('data'))->keyBy('id');
        $this->assertArrayHasKey($customId, $rows->all());
        $this->assertStringContainsString('/us-img/products/mometria-dio.jpg', $rows[$customId]['image_url']);
        $this->assertStringStartsWith('http', $rows[$customId]['image_url']);

        // Search público por nombre del custom.
        $this->getJson('/api/v1/us/catalog?search=mometria')->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $customId);

        // Search del admin por nombre del custom (no hay product que matchear).
        $this->actingAs($this->admin)->getJson('/api/v1/us/listings?search=mometria')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $customId);

        // REGRESIÓN: un listing de producto POS agotado se sigue ocultando.
        $this->makeListing($this->makeProduct('Agotado', 'FIG-099', stock: 0), [
            'name' => 'Producto Agotado',
        ]);
        $this->getJson('/api/v1/us/catalog?search=agotado')->assertOk()
            ->assertJsonCount(0, 'data');
    }

    public function test_import_us_catalog_idempotente(): void
    {
        $json = [
            ['slug' => 'mometria-dio', 'name' => 'Mometria Dio', 'price_usd' => 37,
                'category' => 'figures', 'image' => 'us-img/products/mometria-dio.jpg'],
            ['slug' => 'booster-box-op-13', 'name' => 'Booster box OP-13', 'price_usd' => 180,
                'category' => 'tcg', 'image' => 'us-img/products/booster-box-op-13.jpg'],
            ['slug' => 'sin-categoria', 'name' => 'Misterioso', 'price_usd' => 5,
                'category' => 'no-existe', 'image' => null],
        ];
        $file = tempnam(sys_get_temp_dir(), 'uscat') . '.json';
        file_put_contents($file, json_encode($json));

        $this->artisan('tadaima:import-us-catalog', ['--file' => $file])
            ->assertExitCode(0);

        $this->assertDatabaseCount('us_listings', 3);
        $this->assertDatabaseHas('us_listings', [
            'slug' => 'mometria-dio', 'name' => 'Mometria Dio',
            'price_usd' => 37.0, 'category' => 'figures', 'product_id' => null,
        ]);
        // Categoría inválida degrada a 'other'.
        $this->assertDatabaseHas('us_listings', ['slug' => 'sin-categoria', 'category' => 'other']);

        // Edición manual del admin (precio) …
        UsListing::where('slug', 'mometria-dio')->update(['price_usd' => 42]);

        // … re-correr NO duplica NI pisa sin --pisar.
        $this->artisan('tadaima:import-us-catalog', ['--file' => $file])
            ->assertExitCode(0);
        $this->assertDatabaseCount('us_listings', 3);
        $this->assertDatabaseHas('us_listings', ['slug' => 'mometria-dio', 'price_usd' => 42.0]);

        // Con --pisar sí restaura lo del JSON.
        $this->artisan('tadaima:import-us-catalog', ['--file' => $file, '--pisar' => true])
            ->assertExitCode(0);
        $this->assertDatabaseCount('us_listings', 3);
        $this->assertDatabaseHas('us_listings', ['slug' => 'mometria-dio', 'price_usd' => 37.0]);

        unlink($file);
    }

    public function test_upload_de_imagen_us(): void
    {
        \Illuminate\Support\Facades\Storage::fake(config('filesystems.default'));

        $this->postJson('/api/v1/us/uploads')->assertUnauthorized();
        $this->actingAs($this->cajero)->postJson('/api/v1/us/uploads', [
            'image' => \Illuminate\Http\UploadedFile::fake()->image('foto.jpg'),
        ])->assertForbidden();

        $resp = $this->actingAs($this->admin)->postJson('/api/v1/us/uploads', [
            'image' => \Illuminate\Http\UploadedFile::fake()->image('foto.jpg', 600, 600),
        ])->assertCreated();

        $path = $resp->json('data.path');
        $this->assertStringStartsWith('us-listings/', $path);
        $this->assertNotEmpty($resp->json('data.url'));
        \Illuminate\Support\Facades\Storage::disk(config('filesystems.default'))
            ->assertExists($path);

        // No-imagen → 422.
        $this->actingAs($this->admin)->postJson('/api/v1/us/uploads', [
            'image' => \Illuminate\Http\UploadedFile::fake()->create('doc.pdf', 100),
        ])->assertStatus(422);
    }

    // ── Admin: RBAC ───────────────────────────────────────────────────────────

    public function test_no_admin_recibe_403_y_sin_token_401(): void
    {
        $product = $this->makeProduct('Funko', 'FIG-001');

        // OJO: las aserciones SIN token van PRIMERO — actingAs() persiste el
        // resto del test y convertiría estos 401 esperados en 403.
        $this->getJson('/api/v1/us/listings')->assertUnauthorized();
        $this->getJson('/api/v1/us/products')->assertUnauthorized();
        $this->getJson('/api/v1/us/orders')->assertUnauthorized();

        foreach ([$this->gerente, $this->cajero] as $user) {
            $this->actingAs($user)->getJson('/api/v1/us/listings')->assertForbidden();
            $this->actingAs($user)->postJson('/api/v1/us/listings', [
                'product_id' => $product->id, 'name' => 'X',
                'price_usd' => 10, 'category' => 'other',
            ])->assertForbidden();
            $this->actingAs($user)->getJson('/api/v1/us/products')->assertForbidden();
            $this->actingAs($user)->getJson('/api/v1/us/orders')->assertForbidden();
        }
        $this->assertDatabaseCount('us_listings', 0);
    }

    // ── Admin: buscador de productos no listados ──────────────────────────────

    public function test_products_search_excluye_ya_listados(): void
    {
        $listado = $this->makeProduct('Lugia EX Premium', 'TCG-010', priceA: 899.50);
        $this->makeListing($listado);

        $libre = $this->makeProduct('Riftbound Booster', 'TCG-020', priceA: 120);
        ProductImage::create([
            'product_id' => $libre->id, 'image_path' => 'products/riftbound.jpg', 'sort_order' => 0,
        ]);
        $otro = $this->makeProduct('Turbo Granny Backpack', 'FIG-030');

        // Sin search: solo los NO listados.
        $resp = $this->actingAs($this->admin)->getJson('/api/v1/us/products')->assertOk();
        $ids = array_column($resp->json('data'), 'id');
        $this->assertEqualsCanonicalizing([$libre->id, $otro->id], $ids);

        // Shape del contrato: { id, name, sku, image_url, price_a }.
        $rows = collect($resp->json('data'))->keyBy('id');
        $this->assertSame('TCG-020', $rows[$libre->id]['sku']);
        $this->assertEquals(120, $rows[$libre->id]['price_a']);
        $this->assertStringContainsString('products/riftbound.jpg', $rows[$libre->id]['image_url']);
        $this->assertNull($rows[$otro->id]['image_url']);

        // Search por nombre — sigue excluyendo lo ya listado.
        $this->actingAs($this->admin)->getJson('/api/v1/us/products?search=riftbound')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.id', $libre->id);
        $this->actingAs($this->admin)->getJson('/api/v1/us/products?search=lugia')
            ->assertOk()
            ->assertJsonCount(0, 'data');
    }

    // ── Admin: bandeja de pedidos ─────────────────────────────────────────────

    public function test_admin_ve_pedidos_con_items_mas_nuevos_primero(): void
    {
        $a = $this->makeListing($this->makeProduct('Funko', 'FIG-001'), [
            'name' => 'Rengoku Figure', 'price_usd' => 25,
        ]);

        foreach ([['John Doe', 'john@example.com'], ['Jane Roe', 'jane@example.com']] as [$name, $email]) {
            $this->postJson('/api/v1/us/orders', [
                'name' => $name, 'email' => $email, 'phone' => '+1 619 555 0100',
                'items' => [['listing_id' => $a->id, 'quantity' => 2]],
            ])->assertCreated();
        }

        $resp = $this->actingAs($this->admin)->getJson('/api/v1/us/orders')->assertOk();

        $resp->assertJsonCount(2, 'data');
        // Más nuevos primero.
        $resp->assertJsonPath('data.0.customer_name', 'Jane Roe');
        $resp->assertJsonPath('data.1.customer_name', 'John Doe');
        // Items embebidos con snapshot.
        $resp->assertJsonPath('data.0.items.0.name', 'Rengoku Figure');
        $resp->assertJsonPath('data.0.items.0.price_usd', '25.00');
        $resp->assertJsonPath('data.0.items.0.quantity', 2);
        $resp->assertJsonPath('data.0.items.0.line_total_usd', '50.00');
        $resp->assertJsonPath('data.0.total_usd', '50.00');
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /**
     * Producto del POS con stock vendible por default (5 en Exhibición):
     * la tienda US oculta agotados, así que los fixtures nacen "disponibles"
     * salvo que el test pida stock: 0 explícito.
     */
    private function makeProduct(string $name, string $sku, float $priceA = 100, int $stock = 5): Product
    {
        $p = Product::create(['name' => $name, 'sku' => $sku, 'active' => true]);
        $p->price()->create(['price_1' => $priceA]);

        if ($stock > 0) {
            Inventory::create([
                'product_id' => $p->id, 'warehouse_id' => $this->warehouse->id, 'quantity' => $stock,
            ]);
        }

        return $p;
    }

    private function makeListing(Product $product, array $attrs = []): UsListing
    {
        return UsListing::create($attrs + [
            'product_id' => $product->id,
            'name'       => $product->name,
            'price_usd'  => 10,
            'category'   => 'other',
            'visible'    => true,
        ]);
    }

    private function makeUser(string $email, string $roleName, ?int $storeId): User
    {
        $user = User::create([
            'name' => $email, 'email' => $email, 'password' => bcrypt('password'),
            'company_id' => $this->company->id, 'store_id' => $storeId, 'active' => true,
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
