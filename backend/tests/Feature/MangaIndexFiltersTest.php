<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Inventory;
use App\Models\Product;
use App\Models\ProductCategory;
use App\Models\Store;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * GET /mangas — paginación y filtros SERVER-SIDE del tab Tomos (2026-10-12).
 *
 * Bug de tienda: "no despliega todos los mangas". El tab pedía una sola página
 * (50) y filtraba Agotados / Por agotarse / Sin categoría en el navegador sobre
 * esas 50 filas, mientras el badge (GET /products/stats?type=manga) contaba el
 * catálogo completo (~2.8k tomos): badge 2,206 y tabla con unos cuantos.
 *
 * Aquí se fija que el listado pagina de verdad, que cada filtro devuelve
 * EXACTAMENTE lo que cuenta su badge y que sin params nuevos responde igual.
 */
class MangaIndexFiltersTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;
    private Store $storeA;
    private Store $storeB;
    private Warehouse $exhibA;
    private Warehouse $bodegaA;
    private Warehouse $exhibB;
    private User $admin;
    private User $gerenteA;

    protected function setUp(): void
    {
        parent::setUp();

        $this->company = Company::create(['name' => 'Tadaima Test']);

        $this->storeA = Store::create(['company_id' => $this->company->id, 'name' => 'Tienda A', 'active' => true]);
        $this->storeB = Store::create(['company_id' => $this->company->id, 'name' => 'Tienda B', 'active' => true]);

        $this->exhibA = Warehouse::create([
            'company_id' => $this->company->id, 'store_id' => $this->storeA->id,
            'name' => 'Exhibición A', 'type' => 'store', 'active' => true,
        ]);
        $this->bodegaA = Warehouse::create([
            'company_id' => $this->company->id, 'store_id' => $this->storeA->id,
            'name' => 'Bodega A', 'type' => 'bodega', 'active' => true,
        ]);
        $this->exhibB = Warehouse::create([
            'company_id' => $this->company->id, 'store_id' => $this->storeB->id,
            'name' => 'Exhibición B', 'type' => 'store', 'active' => true,
        ]);

        $this->admin = $this->makeUser('admin@test.com', 'admin', null);
        $this->gerenteA = $this->makeUser('gerentea@test.com', 'gerente', $this->storeA->id);
    }

    // ── Paginación ────────────────────────────────────────────────────────────

    public function test_pagina_dos_trae_el_resto_y_el_total_es_real(): void
    {
        for ($i = 1; $i <= 60; $i++) {
            $this->makeManga(sprintf('Tomo %03d', $i));
        }

        $p1 = $this->actingAs($this->admin)->getJson('/api/v1/mangas')->assertOk()->json('data');
        $this->assertCount(50, $p1['data'], 'Default histórico: 50 por página');
        $this->assertSame(60, $p1['pagination']['total']);
        $this->assertSame(2, $p1['pagination']['last_page']);

        $p2 = $this->actingAs($this->admin)->getJson('/api/v1/mangas?page=2')->assertOk()->json('data');
        $this->assertCount(10, $p2['data']);
        $this->assertSame(2, $p2['pagination']['current_page']);

        $ids = collect($p1['data'])->pluck('id')->merge(collect($p2['data'])->pluck('id'));
        $this->assertCount(60, $ids->unique(), 'Entre las dos páginas salen los 60, sin repetidos ni huecos');
    }

    public function test_per_page_respeta_el_tope_de_200(): void
    {
        $this->makeManga('Tomo único');

        $data = $this->actingAs($this->admin)->getJson('/api/v1/mangas?per_page=5000')->assertOk()->json('data');

        $this->assertSame(200, $data['pagination']['per_page']);
    }

    public function test_sin_params_nuevos_no_trae_productos_normales(): void
    {
        $manga = $this->makeManga('Tomo 1');
        Product::create([
            'company_id' => $this->company->id, 'name' => 'Figura', 'sku' => 'FIG-1', 'active' => true,
        ]);

        $data = $this->actingAs($this->admin)->getJson('/api/v1/mangas')->assertOk()
            ->assertJsonStructure(['data' => ['data', 'pagination' => ['total', 'per_page', 'current_page', 'last_page']]])
            ->json('data');

        $this->assertSame([$manga->id], collect($data['data'])->pluck('id')->all());
    }

    // ── Filtros ───────────────────────────────────────────────────────────────

    public function test_filtro_out_of_stock_global(): void
    {
        $agotado = $this->makeManga('Agotado');
        $conStock = $this->makeManga('Con stock');
        $this->stock($conStock, $this->exhibA, 3);
        $enCero = $this->makeManga('Renglón en cero');
        $this->stock($enCero, $this->exhibA, 0);

        $data = $this->actingAs($this->admin)->getJson('/api/v1/mangas?out_of_stock=1')->assertOk()->json('data');

        $this->assertEqualsCanonicalizing([$agotado->id, $enCero->id], collect($data['data'])->pluck('id')->all());
        $this->assertSame(2, $data['pagination']['total']);
    }

    public function test_filtro_out_of_stock_por_tienda_suma_exhibicion_y_bodega(): void
    {
        // Solo Bodega de A: NO está agotado en A (el badge tampoco lo cuenta).
        $soloBodega = $this->makeManga('Solo bodega A');
        $this->stock($soloBodega, $this->bodegaA, 2);
        // Stock solo en B: en A está agotado.
        $soloB = $this->makeManga('Solo tienda B');
        $this->stock($soloB, $this->exhibB, 9);
        // Sin renglón en ninguna tienda ("No asignado").
        $noAsignado = $this->makeManga('No asignado');

        $ids = $this->ids("store_id={$this->storeA->id}&include_unassigned=1&out_of_stock=1");

        $this->assertEqualsCanonicalizing([$soloB->id, $noAsignado->id], $ids);
    }

    public function test_filtro_low_stock_con_threshold(): void
    {
        $uno = $this->makeManga('Uno');
        $this->stock($uno, $this->exhibA, 1);
        $diez = $this->makeManga('Diez');
        $this->stock($diez, $this->exhibA, 6);
        $this->stock($diez, $this->bodegaA, 4);
        $once = $this->makeManga('Once');
        $this->stock($once, $this->exhibA, 11);
        $this->makeManga('Cero');

        $base = "store_id={$this->storeA->id}&include_unassigned=1&low_stock=1";

        $this->assertEqualsCanonicalizing([$uno->id, $diez->id], $this->ids($base), 'Default: 1 a 10');
        $this->assertEqualsCanonicalizing([$uno->id], $this->ids($base . '&threshold=5'));
    }

    public function test_filtro_no_category_lee_el_pivote(): void
    {
        $cat = ProductCategory::create(['name' => 'Manga Nacional', 'active' => true]);
        $conCat = $this->makeManga('Con categoría');
        $conCat->syncCategories([$cat->id]);
        $sinCat = $this->makeManga('Sin categoría');
        // La caché legacy NO manda: pivote vacío = sin categoría.
        DB::table('products')->where('id', $sinCat->id)->update(['category_id' => $cat->id]);

        $this->assertSame([$sinCat->id], $this->ids('no_category=1'));
    }

    public function test_el_total_de_cada_filtro_es_el_numero_del_badge(): void
    {
        $cat = ProductCategory::create(['name' => 'Manga Nacional', 'active' => true]);
        // 3 agotados en A (uno con stock solo en B), 2 por agotarse, 1 con stock de sobra.
        $this->makeManga('Agotado 1')->syncCategories([$cat->id]);
        $this->makeManga('Agotado 2');
        $soloB = $this->makeManga('Solo B');
        $this->stock($soloB, $this->exhibB, 4);
        $poco = $this->makeManga('Poco');
        $poco->syncCategories([$cat->id]);
        $this->stock($poco, $this->exhibA, 2);
        $pocoBodega = $this->makeManga('Poco en bodega');
        $this->stock($pocoBodega, $this->bodegaA, 10);
        $mucho = $this->makeManga('Mucho');
        $mucho->syncCategories([$cat->id]);
        $this->stock($mucho, $this->exhibA, 40);
        // Un producto normal agotado y sin categoría NO debe colarse en ningún lado.
        Product::create(['company_id' => $this->company->id, 'name' => 'Figura', 'sku' => 'FIG-1', 'active' => true]);

        foreach ([null, $this->storeA->id] as $storeId) {
            $scope = $storeId ? "store_id={$storeId}&include_unassigned=1&" : '';
            $stats = $this->actingAs($this->admin)
                ->getJson('/api/v1/products/stats?type=manga' . ($storeId ? "&store_id={$storeId}" : ''))
                ->assertOk()->json('data');

            $label = $storeId ? 'tienda A' : 'global';
            $this->assertSame($stats['agotados'], $this->total($scope . 'out_of_stock=1'), "Agotados ({$label})");
            $this->assertSame($stats['por_agotarse'], $this->total($scope . 'low_stock=1'), "Por agotarse ({$label})");
            $this->assertSame($stats['sin_categoria'], $this->total($scope . 'no_category=1'), "Sin categoría ({$label})");
            $this->assertSame($stats['total'], $this->total(rtrim($scope, '&')), "Total ({$label})");
        }

        // Y los números no son triviales (si todo diera 0 la paridad pasaría sola).
        $this->assertSame(3, $this->total("store_id={$this->storeA->id}&include_unassigned=1&out_of_stock=1"));
        $this->assertSame(2, $this->total("store_id={$this->storeA->id}&include_unassigned=1&low_stock=1"));
        $this->assertSame(3, $this->total('no_category=1'));
    }

    public function test_gerente_ve_en_su_tienda_lo_mismo_que_cuenta_su_badge(): void
    {
        // El badge del gerente lo ancla el server a SU tienda; la tabla manda
        // ?store_id con esa misma tienda. Los dos números deben coincidir.
        $this->makeManga('No asignado');
        $soloB = $this->makeManga('Solo B');
        $this->stock($soloB, $this->exhibB, 30);
        $poco = $this->makeManga('Poco en A');
        $this->stock($poco, $this->bodegaA, 3);
        $mucho = $this->makeManga('Mucho en A');
        $this->stock($mucho, $this->exhibA, 25);

        $stats = $this->actingAs($this->gerenteA)
            ->getJson('/api/v1/products/stats?type=manga')
            ->assertOk()->json('data');
        $this->assertSame($this->storeA->id, $stats['store_id']);

        $scope = "store_id={$this->storeA->id}&include_unassigned=1";
        $this->assertSame(2, $stats['agotados']);
        $this->assertSame($stats['agotados'], $this->total("{$scope}&out_of_stock=1", $this->gerenteA));
        $this->assertSame(1, $stats['por_agotarse']);
        $this->assertSame($stats['por_agotarse'], $this->total("{$scope}&low_stock=1", $this->gerenteA));
        $this->assertSame($stats['total'], $this->total($scope, $this->gerenteA));
    }

    // ── Búsqueda ──────────────────────────────────────────────────────────────

    public function test_la_busqueda_no_se_salta_los_demas_filtros(): void
    {
        // Coinciden SOLO por editorial (el OR más interno de la búsqueda): si
        // ese OR se escapara de su grupo, ignoraría activo / tienda / chip.
        $inactivo = $this->makeManga('Tomo inactivo', 'Panini');
        $inactivo->update(['active' => false]);
        $deOtraTienda = $this->makeManga('Tomo de B', 'Panini');
        $this->stock($deOtraTienda, $this->exhibB, 5);
        $deA = $this->makeManga('Tomo de A', 'Panini');
        $this->stock($deA, $this->exhibA, 5);
        $normal = Product::create([
            'company_id' => $this->company->id, 'name' => 'Figura Panini', 'sku' => 'FIG-PANINI', 'active' => true,
        ]);

        $this->assertEqualsCanonicalizing(
            [$deOtraTienda->id, $deA->id],
            $this->ids('search=panini&active=1'),
            'active=1 sigue filtrando',
        );
        $this->assertSame(
            [$deA->id],
            $this->ids("search=panini&store_id={$this->storeA->id}"),
            'Sin include_unassigned solo salen los que tienen inventario en la tienda',
        );
        $this->assertSame(
            [$inactivo->id],
            $this->ids('search=panini&out_of_stock=1'),
            'El chip sigue filtrando',
        );
        $this->assertNotContains($normal->id, $this->ids('search=panini'), 'Nunca un producto normal');
    }

    public function test_busqueda_por_editorial_y_genero(): void
    {
        $panini = $this->makeManga('Tomo 1 Chainsaw', 'Panini', 'Shonen');
        $kamite = $this->makeManga('Tomo 2 Berserk', 'Kamite', 'Seinen');

        $this->assertSame([$panini->id], $this->ids('search=panini'), 'Editorial, sin distinguir mayúsculas');
        $this->assertSame([$kamite->id], $this->ids('search=SEINEN'), 'Género');
        $this->assertSame([$kamite->id], $this->ids('search=berserk'), 'El nombre sigue funcionando');
    }

    public function test_busqueda_por_sku_y_codigo_de_barras(): void
    {
        $tomo = $this->makeManga('Tomo 5');
        $tomo->update(['sku' => 'MNG-ABC-5', 'barcode' => '9786075286518']);
        $this->makeManga('Otro tomo');

        $this->assertSame([$tomo->id], $this->ids('search=9786075286518'));
        $this->assertSame([$tomo->id], $this->ids('search=mng-abc'));
    }

    public function test_filtro_y_busqueda_combinan(): void
    {
        $agotado = $this->makeManga('Naruto 1');
        $conStock = $this->makeManga('Naruto 2');
        $this->stock($conStock, $this->exhibA, 5);
        $this->makeManga('Bleach 1');

        $this->assertSame([$agotado->id], $this->ids('search=naruto&out_of_stock=1'));
    }

    // ── Orden ─────────────────────────────────────────────────────────────────

    public function test_con_stock_primero_y_luego_por_nombre(): void
    {
        $agotadoA = $this->makeManga('Akira 1');
        $conStockZ = $this->makeManga('Zetman 1');
        $this->stock($conStockZ, $this->exhibA, 2);
        $conStockB = $this->makeManga('Berserk 1');
        $this->stock($conStockB, $this->bodegaA, 1);
        $agotadoC = $this->makeManga('Claymore 1');

        $ordered = $this->ids("store_id={$this->storeA->id}&include_unassigned=1");

        $this->assertSame(
            [$conStockB->id, $conStockZ->id, $agotadoA->id, $agotadoC->id],
            $ordered,
            'Los agotados van al final; dentro de cada grupo, por nombre',
        );
    }

    public function test_nombres_repetidos_no_se_repiten_ni_se_saltan_entre_paginas(): void
    {
        // Mismo nombre en todos y stock alternado: el contrato es "con stock
        // primero, y dentro de cada grupo por id". (SQLite suele devolver los
        // empates en orden de inserción aun sin el desempate; el `orderBy('id')`
        // es lo que lo garantiza en Postgres — por eso esta suite también se
        // corre con phpunit.pgsql.xml.)
        $conStock = [];
        $agotados = [];
        for ($i = 0; $i < 25; $i++) {
            $m = $this->makeManga('Tomo 1');
            if ($i % 2 === 0) {
                $this->stock($m, $this->exhibA, 1 + $i);
                $conStock[] = $m->id;
            } else {
                $agotados[] = $m->id;
            }
        }

        $seen = [];
        foreach ([1, 2, 3] as $page) {
            $seen = [...$seen, ...$this->ids("per_page=10&page={$page}")];
        }

        $this->assertSame([...$conStock, ...$agotados], $seen);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /** @return list<int> ids en el orden que los devuelve el listado */
    private function ids(string $query = '', ?User $as = null): array
    {
        return collect($this->listado($query, $as)['data'])->pluck('id')->all();
    }

    private function total(string $query = '', ?User $as = null): int
    {
        return (int) $this->listado($query, $as)['pagination']['total'];
    }

    /** @return array{data: list<array<string, mixed>>, pagination: array<string, int>} */
    private function listado(string $query, ?User $as = null): array
    {
        return $this->actingAs($as ?? $this->admin)
            ->getJson('/api/v1/mangas' . ($query !== '' ? "?{$query}" : ''))
            ->assertOk()
            ->json('data');
    }

    private function makeManga(string $name, string $editorial = 'Ed', string $genre = 'shonen'): Product
    {
        $m = Product::create([
            'company_id' => $this->company->id,
            'name' => $name, 'sku' => 'MNG-' . uniqid('', true), 'active' => true,
            'product_type' => Product::TYPE_MANGA,
        ]);
        $m->mangaDetails()->create(['volume_number' => 1, 'editorial' => $editorial, 'genre' => $genre]);
        $m->price()->create(['price_1' => 150]);

        return $m;
    }

    private function stock(Product $p, Warehouse $w, float $qty): void
    {
        Inventory::create(['product_id' => $p->id, 'warehouse_id' => $w->id, 'quantity' => $qty]);
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
