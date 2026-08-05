<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Inventory;
use App\Models\Product;
use App\Models\ProductCategory;
use App\Models\ProductPromotion;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\Store;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * GET /products — filtros server-side + metadata de paginación opt-in
 * (2026-08-04, página Productos con catálogo de ~14k).
 *
 * Los chips (sin costo / agotados / por agotarse / promos) ahora filtran en el
 * backend y COMBINAN por AND con search/categoría/tienda. `?with_meta=1`
 * expone `{items, pagination}`; sin el flag el shape histórico (array plano)
 * queda intacto — regresión cubierta aquí.
 */
class ProductIndexFiltersTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;
    private Store $store;
    private Warehouse $exhib;
    private User $admin;
    private ProductCategory $catFiguras;

    private Product $sinCostoAgotado;   // cost NULL, stock 0,  "Poster Luffy"
    private Product $sinCostoConStock;  // cost 0,    stock 3,  "Goku Cheap"
    private Product $conCostoPocoStock; // cost 10,   stock 5,  "Vegeta"
    private Product $conCostoMuchoStock; // cost 20,  stock 50, "Goku Special" (cat Figuras)

    protected function setUp(): void
    {
        parent::setUp();

        $this->company = Company::create(['name' => 'Tadaima Test']);
        $this->store = Store::create(['company_id' => $this->company->id, 'name' => 'Tienda A', 'active' => true]);
        $this->exhib = Warehouse::create([
            'company_id' => $this->company->id, 'store_id' => $this->store->id,
            'name' => 'Exhibición A', 'type' => 'store', 'active' => true,
        ]);
        $this->admin = $this->makeAdmin();
        $this->catFiguras = ProductCategory::create(['name' => 'Figuras', 'active' => true]);

        $this->sinCostoAgotado = $this->makeProduct('Poster Luffy', null);
        $this->sinCostoConStock = $this->makeProduct('Goku Cheap', 0.0, 3);
        $this->conCostoPocoStock = $this->makeProduct('Vegeta', 10.0, 5);
        $this->conCostoMuchoStock = $this->makeProduct('Goku Special', 20.0, 50, $this->catFiguras->id);
    }

    private function makeProduct(string $name, ?float $cost, float $stock = 0, ?int $categoryId = null): Product
    {
        $p = Product::create([
            'company_id' => $this->company->id,
            'name' => $name, 'sku' => 'SKU-' . uniqid(), 'active' => true,
            'cost' => $cost, 'category_id' => $categoryId,
        ]);
        $p->price()->create(['price_1' => 100]);
        if ($stock > 0) {
            Inventory::create(['product_id' => $p->id, 'warehouse_id' => $this->exhib->id, 'quantity' => $stock]);
        }

        return $p;
    }

    /** ids devueltos por el index para un query string dado. */
    private function ids(string $qs): array
    {
        $json = $this->actingAs($this->admin)
            ->getJson("/api/v1/products?per_page=0{$qs}")
            ->assertOk()->json('data');

        return collect($json)->pluck('id')->sort()->values()->all();
    }

    /** Igual que ids() pero preserva el orden que regresa el backend (sin sort()). */
    private function orderedIds(string $qs): array
    {
        $json = $this->actingAs($this->admin)
            ->getJson("/api/v1/products?per_page=0{$qs}")
            ->assertOk()->json('data');

        return collect($json)->pluck('id')->values()->all();
    }

    public function test_filtro_no_cost(): void
    {
        $this->assertSame(
            collect([$this->sinCostoAgotado->id, $this->sinCostoConStock->id])->sort()->values()->all(),
            $this->ids('&no_cost=1'),
        );
    }

    public function test_filtro_out_of_stock(): void
    {
        $this->assertSame([$this->sinCostoAgotado->id], $this->ids('&out_of_stock=1'));
    }

    public function test_filtro_low_stock_con_threshold(): void
    {
        // Default 10: stock 3 y 5 entran, 50 no, 0 no (agotado ≠ por agotarse).
        $this->assertSame(
            collect([$this->sinCostoConStock->id, $this->conCostoPocoStock->id])->sort()->values()->all(),
            $this->ids('&low_stock=1'),
        );
        // threshold=4: solo el de stock 3.
        $this->assertSame([$this->sinCostoConStock->id], $this->ids('&low_stock=1&threshold=4'));
    }

    public function test_filtro_low_stock_scoped_a_tienda(): void
    {
        // Producto con stock en OTRA tienda: para esta tienda está agotado.
        $storeB = Store::create(['company_id' => $this->company->id, 'name' => 'Tienda B', 'active' => true]);
        $exhibB = Warehouse::create([
            'company_id' => $this->company->id, 'store_id' => $storeB->id,
            'name' => 'Exhibición B', 'type' => 'store', 'active' => true,
        ]);
        $soloEnB = $this->makeProduct('Solo en B', 5.0);
        Inventory::create(['product_id' => $soloEnB->id, 'warehouse_id' => $exhibB->id, 'quantity' => 4]);

        $outIds = $this->ids("&out_of_stock=1&store_id={$this->store->id}&include_unassigned=1");
        $this->assertContains($soloEnB->id, $outIds, 'Con stock solo en B cuenta agotado en A');

        $lowIds = $this->ids("&low_stock=1&store_id={$storeB->id}&include_unassigned=1");
        $this->assertSame([$soloEnB->id], $lowIds, 'En B es el único por agotarse');
    }

    public function test_filtro_has_promo(): void
    {
        ProductPromotion::create([
            'product_id' => $this->conCostoMuchoStock->id, 'store_id' => null,
            'name' => '2x1', 'buy_n' => 2, 'pay_m' => 1, 'status' => 'active', 'priority' => 0,
        ]);
        ProductPromotion::create([
            'product_id' => $this->conCostoPocoStock->id, 'store_id' => null,
            'name' => 'Vencida', 'buy_n' => 2, 'pay_m' => 1, 'status' => 'active', 'priority' => 0,
            'ends_at' => now()->subDay(),
        ]);

        $this->assertSame([$this->conCostoMuchoStock->id], $this->ids('&has_promo=1'));
    }

    public function test_search_y_filtro_combinan_por_and(): void
    {
        // "Goku" matchea 2 productos; con no_cost solo queda el barato.
        $this->assertSame([$this->sinCostoConStock->id], $this->ids('&search=Goku&no_cost=1'));
    }

    public function test_filtro_category_id(): void
    {
        $this->assertSame([$this->conCostoMuchoStock->id], $this->ids("&category_id={$this->catFiguras->id}"));
    }

    public function test_with_meta_pagina_con_total_real(): void
    {
        $resp = $this->actingAs($this->admin)
            ->getJson('/api/v1/products?with_meta=1&per_page=2&page=1')
            ->assertOk()->json('data');

        $this->assertCount(2, $resp['items']);
        $this->assertSame(4, $resp['pagination']['total']);
        $this->assertSame(2, $resp['pagination']['per_page']);
        $this->assertSame(1, $resp['pagination']['current_page']);
        $this->assertSame(2, $resp['pagination']['last_page']);

        $page2 = $this->actingAs($this->admin)
            ->getJson('/api/v1/products?with_meta=1&per_page=2&page=2')
            ->assertOk()->json('data');
        $this->assertSame(2, $page2['pagination']['current_page']);
        $this->assertNotSame(
            collect($resp['items'])->pluck('id')->all(),
            collect($page2['items'])->pluck('id')->all(),
            'La página 2 trae otros productos',
        );
    }

    public function test_sin_with_meta_el_shape_plano_queda_intacto(): void
    {
        // Regresión: 7 consumidores (Caja, Layout, StoreContext, …) esperan
        // el array plano directo bajo data.
        $data = $this->actingAs($this->admin)
            ->getJson('/api/v1/products?per_page=2')
            ->assertOk()->json('data');

        $this->assertIsArray($data);
        $this->assertArrayNotHasKey('items', $data);
        $this->assertArrayHasKey('id', $data[0]);
    }

    public function test_with_meta_con_per_page_cero_meta_sintetica(): void
    {
        $resp = $this->actingAs($this->admin)
            ->getJson('/api/v1/products?with_meta=1&per_page=0')
            ->assertOk()->json('data');

        $this->assertCount(4, $resp['items']);
        $this->assertSame(4, $resp['pagination']['total']);
        $this->assertSame(1, $resp['pagination']['last_page']);
    }

    /**
     * Orden default (Joel 2026-08-05): productos sin stock SIEMPRE al final,
     * sin eliminarlos. Setup ya tiene 1 sin stock (sinCostoAgotado) y 3 con
     * stock (ids ascendentes por orden de creación: sinCostoConStock,
     * conCostoPocoStock, conCostoMuchoStock) — el tiebreak es id asc.
     */
    public function test_orden_default_sin_stock_al_final(): void
    {
        $this->assertSame(
            [
                $this->sinCostoConStock->id,
                $this->conCostoPocoStock->id,
                $this->conCostoMuchoStock->id,
                $this->sinCostoAgotado->id,
            ],
            $this->orderedIds(''),
        );
    }

    public function test_orden_no_cambia_el_total_solo_el_orden(): void
    {
        $resp = $this->actingAs($this->admin)
            ->getJson('/api/v1/products?with_meta=1&per_page=0')
            ->assertOk()->json('data');

        $this->assertSame(4, $resp['pagination']['total']);
        $this->assertCount(4, $resp['items']);
    }

    public function test_sort_top_tambien_manda_sin_stock_al_final(): void
    {
        // Producto agotado pero con MÁS ventas recientes que cualquier otro.
        $agotadoTopVentas = $this->makeProduct('Agotado Top Ventas', 5.0, 0);
        $sale = Sale::create([
            'store_id' => $this->store->id,
            'user_id' => $this->admin->id,
            'subtotal' => 100, 'discount' => 0, 'total' => 100,
            'status' => Sale::STATUS_COMPLETED,
            'created_at' => now(),
        ]);
        SaleItem::create([
            'sale_id' => $sale->id, 'product_id' => $agotadoTopVentas->id,
            'quantity' => 10, 'price' => 10, 'total' => 100, 'cost' => 5.0,
        ]);

        $ordered = $this->orderedIds('&sort=top');
        $posAgotadoTopVentas = array_search($agotadoTopVentas->id, $ordered, true);

        // Los 3 con stock (aunque vendan 0 en 30 días) van ANTES que el
        // agotado, pese a `sort=top` y a que el agotado vendió más.
        foreach ([$this->sinCostoConStock, $this->conCostoPocoStock, $this->conCostoMuchoStock] as $conStock) {
            $this->assertLessThan(
                $posAgotadoTopVentas,
                array_search($conStock->id, $ordered, true),
                "Producto con stock ({$conStock->name}) debe quedar antes que el agotado, pese a sort=top",
            );
        }

        // Dentro del grupo sin stock, el ranking por ventas se conserva: el
        // agotado que sí vendió queda antes que el agotado sin ventas.
        $this->assertLessThan(
            array_search($this->sinCostoAgotado->id, $ordered, true),
            $posAgotadoTopVentas,
            'Entre agotados, el que vendió más sigue rankeando arriba',
        );
    }

    private function makeAdmin(): User
    {
        $user = User::create([
            'name' => 'admin@test.com', 'email' => 'admin@test.com', 'password' => bcrypt('password'),
            'company_id' => $this->company->id, 'store_id' => null, 'active' => true,
        ]);

        $roleId = DB::table('roles')->where('name', 'admin')->value('id')
            ?? DB::table('roles')->insertGetId([
                'name' => 'admin', 'guard_name' => 'api',
                'created_at' => now(), 'updated_at' => now(),
            ]);

        DB::table('model_has_roles')->insert([
            'role_id' => $roleId, 'model_type' => User::class, 'model_id' => $user->id,
        ]);

        return $user;
    }
}
