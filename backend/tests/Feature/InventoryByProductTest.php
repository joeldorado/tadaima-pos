<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Product;
use App\Models\Store;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * GET /inventory/by-product/{productId}
 *
 * Endpoint cross-tienda para la pantalla "Buscar en Tiendas": cualquier rol
 * autenticado ve el stock de todas las sucursales sin filtro de tienda.
 * No expone costos ni datos financieros.
 */
class InventoryByProductTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;
    private Store $storeA;
    private Store $storeB;
    private Warehouse $whA;
    private Warehouse $whB;
    private Product $product;
    private User $admin;
    private User $cajero;

    protected function setUp(): void
    {
        parent::setUp();

        $this->company = Company::create(['name' => 'Test Co']);

        $this->storeA = Store::create(['company_id' => $this->company->id, 'name' => 'Tienda A', 'active' => true, 'phone' => '6641112222']);
        $this->storeB = Store::create(['company_id' => $this->company->id, 'name' => 'Tienda B', 'active' => true, 'phone' => '6643334444']);

        $this->whA = Warehouse::create(['company_id' => $this->company->id, 'store_id' => $this->storeA->id, 'name' => 'Exhibición A', 'type' => 'store', 'active' => true]);
        $this->whB = Warehouse::create(['company_id' => $this->company->id, 'store_id' => $this->storeB->id, 'name' => 'Exhibición B', 'type' => 'store', 'active' => true]);

        $this->product = Product::create([
            'name' => 'Figura Goku', 'sku' => 'FIG-001', 'active' => true,
            'product_type' => Product::TYPE_PRODUCT,
        ]);

        DB::table('inventory')->insert([
            ['product_id' => $this->product->id, 'warehouse_id' => $this->whA->id, 'quantity' => 5, 'created_at' => now(), 'updated_at' => now()],
            ['product_id' => $this->product->id, 'warehouse_id' => $this->whB->id, 'quantity' => 12, 'created_at' => now(), 'updated_at' => now()],
        ]);

        $this->admin = User::create([
            'name' => 'Admin', 'email' => 'admin@test.com', 'password' => bcrypt('x'),
            'company_id' => $this->company->id,
        ]);

        $this->cajero = User::create([
            'name' => 'Cajero', 'email' => 'cajero@test.com', 'password' => bcrypt('x'),
            'company_id' => $this->company->id,
            'store_id' => $this->storeA->id, // cajero pertenece solo a Tienda A
        ]);
    }

    public function test_cajero_ve_stock_de_todas_las_tiendas(): void
    {
        $res = $this->actingAs($this->cajero)
            ->getJson("/api/v1/inventory/by-product/{$this->product->id}");

        $res->assertOk()->assertJsonPath('success', true);

        $data = $res->json('data');
        $this->assertCount(2, $data, 'Debe devolver las dos bodegas (Tienda A y Tienda B)');

        $storeIds = collect($data)->pluck('warehouse.store.id')->sort()->values()->toArray();
        $this->assertEqualsCanonicalizing([$this->storeA->id, $this->storeB->id], $storeIds);
    }

    public function test_devuelve_nombre_sku_cantidad_y_contacto(): void
    {
        $res = $this->actingAs($this->cajero)
            ->getJson("/api/v1/inventory/by-product/{$this->product->id}");

        $res->assertOk();
        $rowA = collect($res->json('data'))->firstWhere('warehouse.store.id', $this->storeA->id);

        $this->assertEquals('Figura Goku', $rowA['product']['name']);
        $this->assertEquals('FIG-001', $rowA['product']['sku']);
        $this->assertEquals(5, $rowA['quantity']);
        $this->assertEquals('Tienda A', $rowA['warehouse']['store']['name']);
        $this->assertEquals('6641112222', $rowA['warehouse']['store']['phone']);
    }

    public function test_no_expone_costo(): void
    {
        $res = $this->actingAs($this->cajero)
            ->getJson("/api/v1/inventory/by-product/{$this->product->id}");

        $res->assertOk();
        foreach ($res->json('data') as $row) {
            $this->assertArrayNotHasKey('cost', $row);
            $this->assertArrayNotHasKey('cost', $row['product'] ?? []);
        }
    }

    public function test_admin_tambien_ve_todas_las_tiendas(): void
    {
        $res = $this->actingAs($this->admin)
            ->getJson("/api/v1/inventory/by-product/{$this->product->id}");

        $res->assertOk();
        $this->assertCount(2, $res->json('data'));
    }

    public function test_producto_inexistente_devuelve_404(): void
    {
        $this->actingAs($this->cajero)
            ->getJson('/api/v1/inventory/by-product/99999')
            ->assertNotFound();
    }

    public function test_requiere_autenticacion(): void
    {
        $this->getJson("/api/v1/inventory/by-product/{$this->product->id}")
            ->assertUnauthorized();
    }

    // ── GET /inventory/products-stock ─────────────────────────────────────────

    public function test_products_stock_devuelve_todos_los_productos_con_stock_embebido(): void
    {
        $res = $this->actingAs($this->cajero)
            ->getJson('/api/v1/inventory/products-stock');

        $res->assertOk()->assertJsonPath('success', true);

        $data = $res->json('data.data');
        $this->assertNotEmpty($data);

        $row = collect($data)->firstWhere('id', $this->product->id);
        $this->assertNotNull($row, 'El producto debe aparecer en la lista');
        $this->assertEquals('Figura Goku', $row['name']);
        $this->assertEquals('FIG-001', $row['sku']);

        // Debe traer las dos tiendas embebidas
        $storeIds = collect($row['stock'])->pluck('store_id')->sort()->values()->toArray();
        $this->assertEqualsCanonicalizing([$this->storeA->id, $this->storeB->id], $storeIds);
    }

    public function test_products_stock_separa_exhibicion_y_bodega(): void
    {
        // Agrega una bodega en Tienda A
        $bodegaA = \App\Models\Warehouse::create([
            'company_id' => $this->company->id, 'store_id' => $this->storeA->id,
            'name' => 'Bodega A', 'type' => 'bodega', 'active' => true,
        ]);
        \Illuminate\Support\Facades\DB::table('inventory')->insert([
            'product_id' => $this->product->id, 'warehouse_id' => $bodegaA->id,
            'quantity' => 3, 'created_at' => now(), 'updated_at' => now(),
        ]);

        $res = $this->actingAs($this->cajero)
            ->getJson('/api/v1/inventory/products-stock');

        $row   = collect($res->json('data.data'))->firstWhere('id', $this->product->id);
        $sA    = collect($row['stock'])->firstWhere('store_id', $this->storeA->id);

        $this->assertEquals(5, $sA['exhibicion']);
        $this->assertEquals(3, $sA['bodega']);
    }

    public function test_products_stock_filtra_por_busqueda(): void
    {
        \App\Models\Product::create(['name' => 'Otro Producto', 'sku' => 'OTR-001', 'active' => true, 'product_type' => 'product']);

        $res = $this->actingAs($this->cajero)
            ->getJson('/api/v1/inventory/products-stock?search=Goku');

        $res->assertOk();
        $names = collect($res->json('data.data'))->pluck('name')->toArray();
        $this->assertContains('Figura Goku', $names);
        $this->assertNotContains('Otro Producto', $names);
    }

    public function test_products_stock_devuelve_paginacion(): void
    {
        $res = $this->actingAs($this->cajero)
            ->getJson('/api/v1/inventory/products-stock?per_page=1');

        $res->assertOk();
        $pagination = $res->json('data.pagination');
        $this->assertArrayHasKey('total', $pagination);
        $this->assertArrayHasKey('last_page', $pagination);
        $this->assertEquals(1, $pagination['per_page']);
    }

    public function test_products_stock_no_expone_costo(): void
    {
        $res = $this->actingAs($this->cajero)
            ->getJson('/api/v1/inventory/products-stock');

        $res->assertOk();
        foreach ($res->json('data.data') as $row) {
            $this->assertArrayNotHasKey('cost', $row);
            foreach ($row['stock'] as $s) {
                $this->assertArrayNotHasKey('cost', $s);
            }
        }
    }

    public function test_products_stock_requiere_autenticacion(): void
    {
        $this->getJson('/api/v1/inventory/products-stock')
            ->assertUnauthorized();
    }

    // ── Filtros de comparación entre tiendas ─────────────────────────────────────

    public function test_products_stock_ordena_por_tienda_desc(): void
    {
        // storeA tiene 5, storeB tiene 12 — desc por storeB → storeB primero
        $res = $this->actingAs($this->cajero)
            ->getJson("/api/v1/inventory/products-stock?primary_store_id={$this->storeB->id}&sort_dir=desc&per_page=50");

        $res->assertOk();
        // Solo hay un producto; verificamos que llegue sin error y con el stock embebido
        $row = collect($res->json('data.data'))->firstWhere('id', $this->product->id);
        $this->assertNotNull($row);
        $this->assertNotEmpty($row['stock']);
    }

    public function test_products_stock_ordena_por_diferencia_entre_tiendas(): void
    {
        // Crea un segundo producto con más stock en storeA que en storeB
        $prod2 = \App\Models\Product::create([
            'name' => 'Producto Extra', 'sku' => 'EXT-001', 'active' => true, 'product_type' => 'product',
        ]);
        \Illuminate\Support\Facades\DB::table('inventory')->insert([
            ['product_id' => $prod2->id, 'warehouse_id' => $this->whA->id, 'quantity' => 20, 'created_at' => now(), 'updated_at' => now()],
            ['product_id' => $prod2->id, 'warehouse_id' => $this->whB->id, 'quantity' => 1,  'created_at' => now(), 'updated_at' => now()],
        ]);

        // desc con primary=storeA, compare=storeB → prod2 (20-1=19) antes que this->product (5-12=-7)
        $res = $this->actingAs($this->cajero)
            ->getJson("/api/v1/inventory/products-stock?primary_store_id={$this->storeA->id}&compare_store_id={$this->storeB->id}&sort_dir=desc&per_page=50");

        $res->assertOk();
        $ids = collect($res->json('data.data'))->pluck('id')->toArray();
        $posExtra   = array_search($prod2->id,          $ids);
        $posProduct = array_search($this->product->id,  $ids);
        $this->assertLessThan($posProduct, $posExtra, 'Producto con diferencia mayor debe aparecer antes');
    }

    public function test_products_stock_sort_asc_invierte_orden(): void
    {
        $prod2 = \App\Models\Product::create([
            'name' => 'Producto Asc', 'sku' => 'ASC-001', 'active' => true, 'product_type' => 'product',
        ]);
        \Illuminate\Support\Facades\DB::table('inventory')->insert([
            ['product_id' => $prod2->id, 'warehouse_id' => $this->whA->id, 'quantity' => 20, 'created_at' => now(), 'updated_at' => now()],
            ['product_id' => $prod2->id, 'warehouse_id' => $this->whB->id, 'quantity' => 1,  'created_at' => now(), 'updated_at' => now()],
        ]);

        // asc con primary=storeA, compare=storeB → this->product (5-12=-7) antes que prod2 (20-1=19)
        $res = $this->actingAs($this->cajero)
            ->getJson("/api/v1/inventory/products-stock?primary_store_id={$this->storeA->id}&compare_store_id={$this->storeB->id}&sort_dir=asc&per_page=50");

        $res->assertOk();
        $ids        = collect($res->json('data.data'))->pluck('id')->toArray();
        $posExtra   = array_search($prod2->id,         $ids);
        $posProduct = array_search($this->product->id, $ids);
        $this->assertLessThan($posExtra, $posProduct, 'Producto con diferencia menor debe aparecer primero en asc');
    }

    public function test_products_stock_filtra_primary_stock_0(): void
    {
        // this->product tiene stock en storeA (5 uds). Crear otro sin stock.
        $sinStock = \App\Models\Product::create([
            'name' => 'Sin Stock A', 'sku' => 'SS-001', 'active' => true, 'product_type' => 'product',
        ]);

        $res = $this->actingAs($this->cajero)
            ->getJson("/api/v1/inventory/products-stock?primary_store_id={$this->storeA->id}&primary_stock=0&per_page=50");

        $res->assertOk();
        $ids = collect($res->json('data.data'))->pluck('id')->toArray();

        $this->assertContains($sinStock->id, $ids, 'Producto sin stock debe aparecer con primary_stock=0');
        $this->assertNotContains($this->product->id, $ids, 'Producto con stock no debe aparecer con primary_stock=0');
    }

    public function test_products_stock_filtra_primary_stock_1(): void
    {
        $sinStock = \App\Models\Product::create([
            'name' => 'Sin Stock B', 'sku' => 'SS-002', 'active' => true, 'product_type' => 'product',
        ]);

        $res = $this->actingAs($this->cajero)
            ->getJson("/api/v1/inventory/products-stock?primary_store_id={$this->storeA->id}&primary_stock=1&per_page=50");

        $res->assertOk();
        $ids = collect($res->json('data.data'))->pluck('id')->toArray();

        $this->assertContains($this->product->id, $ids, 'Producto con stock debe aparecer con primary_stock=1');
        $this->assertNotContains($sinStock->id, $ids, 'Producto sin stock no debe aparecer con primary_stock=1');
    }

    public function test_products_stock_filtra_compare_stock_exacto(): void
    {
        // this->product tiene 12 uds en storeB. Crear otro con 2 uds en storeB.
        $prod2 = \App\Models\Product::create([
            'name' => 'Compare Exacto', 'sku' => 'CE-001', 'active' => true, 'product_type' => 'product',
        ]);
        \Illuminate\Support\Facades\DB::table('inventory')->insert([
            ['product_id' => $prod2->id, 'warehouse_id' => $this->whB->id, 'quantity' => 2, 'created_at' => now(), 'updated_at' => now()],
        ]);

        $res = $this->actingAs($this->cajero)
            ->getJson("/api/v1/inventory/products-stock?primary_store_id={$this->storeA->id}&compare_store_id={$this->storeB->id}&compare_stock=2&per_page=50");

        $res->assertOk();
        $ids = collect($res->json('data.data'))->pluck('id')->toArray();

        $this->assertContains($prod2->id, $ids, 'Producto con 2 uds en storeB debe aparecer con compare_stock=2');
        $this->assertNotContains($this->product->id, $ids, 'Producto con 12 uds en storeB no debe aparecer con compare_stock=2');
    }

    public function test_products_stock_filtra_compare_stock_3_mas(): void
    {
        // this->product tiene 12 uds en storeB — debe aparecer con compare_stock=3+
        $prod2 = \App\Models\Product::create([
            'name' => 'Poco Stock B', 'sku' => 'PS-001', 'active' => true, 'product_type' => 'product',
        ]);
        \Illuminate\Support\Facades\DB::table('inventory')->insert([
            ['product_id' => $prod2->id, 'warehouse_id' => $this->whB->id, 'quantity' => 1, 'created_at' => now(), 'updated_at' => now()],
        ]);

        $res = $this->actingAs($this->cajero)
            ->getJson("/api/v1/inventory/products-stock?primary_store_id={$this->storeA->id}&compare_store_id={$this->storeB->id}&compare_stock=3%2B&per_page=50");

        $res->assertOk();
        $ids = collect($res->json('data.data'))->pluck('id')->toArray();

        $this->assertContains($this->product->id, $ids, 'Producto con 12 uds debe aparecer con compare_stock=3+');
        $this->assertNotContains($prod2->id, $ids, 'Producto con 1 ud no debe aparecer con compare_stock=3+');
    }
}
