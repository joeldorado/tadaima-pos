<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Product;
use App\Models\Store;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Importador del catálogo Macro (POS viejo Esmeralda S.I → Supabase).
 * Fixture: tests/Fixtures/macro-articulos-sample.json (8 filas, 7 códigos:
 * normal con stock, manga, sin precio, update con costo, update sin costo,
 * dado de baja con costo, y un código duplicado donde el último gana).
 */
class ImportMacroProductsTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;

    private Store $store;

    private Warehouse $exhibicion;

    private User $admin;

    private string $fixture;

    protected function setUp(): void
    {
        parent::setUp();

        $this->company = Company::create(['name' => 'Tadaima Test']);
        $this->store = Store::create([
            'company_id' => $this->company->id, 'name' => 'Tadaima MACRO', 'active' => true,
        ]);
        $this->exhibicion = Warehouse::create([
            'company_id' => $this->company->id, 'store_id' => $this->store->id,
            'name' => 'Exhibición MACRO', 'type' => 'store', 'active' => true,
        ]);
        $this->admin = User::create([
            'name' => 'Admin Import', 'email' => 'import@test.com',
            'password' => bcrypt('password'),
            'company_id' => $this->company->id, 'active' => true,
        ]);
        $this->fixture = base_path('tests/Fixtures/macro-articulos-sample.json');
    }

    /** Corre el comando contra la conexión default del test (sqlite o pgsql). */
    private function runImport(array $extra = [], bool $confirm = true)
    {
        $args = array_merge([
            'file' => $this->fixture,
            '--connection' => config('database.default'),
            '--unsafe-host' => true,
            '--store' => 'Tadaima MACRO',
            '--user' => (string) $this->admin->id,
            '--ref' => 'import-macro-test',
        ], $extra);

        $pending = $this->artisan('tadaima:import-macro', $args);
        if ($confirm) {
            $host = (string) config('database.connections.'.config('database.default').'.host');
            $pending->expectsConfirmation(
                sprintf('¿Importar %d productos a %s?', 7, $host !== '' ? $host : config('database.default')),
                'yes'
            );
        }

        return $pending;
    }

    public function test_importa_productos_nuevos_con_precios_y_stock(): void
    {
        $this->runImport()->assertExitCode(0);

        // Normal: precios pv4→Normal, pv3→Socio; stock a Exhibición con entrada
        $fig = Product::where('sku', '789111')->first();
        $this->assertNotNull($fig);
        $this->assertSame('Figura Goku SSJ', $fig->name);
        $this->assertSame('789111', $fig->barcode);
        $this->assertNull($fig->cost);
        $this->assertSame('product', $fig->product_type);
        $this->assertDatabaseHas('product_prices', [
            'product_id' => $fig->id, 'price_1' => 100.0, 'price_2' => 90.0,
        ]);
        $this->assertDatabaseHas('inventory', [
            'product_id' => $fig->id, 'warehouse_id' => $this->exhibicion->id, 'quantity' => 5.0,
        ]);
        $this->assertDatabaseHas('inventory_movements', [
            'product_id' => $fig->id, 'warehouse_id' => $this->exhibicion->id,
            'type' => 'entrada', 'reference' => 'import-macro-test', 'user_id' => $this->admin->id,
        ]);

        // La categoría se creó por nombre
        $this->assertDatabaseHas('product_categories', ['name' => 'Figuras']);
        $this->assertSame('Figuras', $fig->category?->name);
    }

    public function test_mangas_por_categoria_con_detalle(): void
    {
        $this->runImport()->assertExitCode(0);

        $manga = Product::where('sku', '789222')->first();
        $this->assertSame('manga', $manga->product_type);
        $this->assertDatabaseHas('product_manga_details', ['product_id' => $manga->id]);

        // Sin precio y baja: se importan igual (sin fila de precios / inactivo)
        $sinPrecio = Product::where('sku', '789333')->first();
        $this->assertSame('Promo misteriosa', $sinPrecio->name); // cae a desc_corta
        $this->assertDatabaseMissing('product_prices', ['product_id' => $sinPrecio->id]);

        $baja = Product::where('sku', '789444')->first();
        $this->assertFalse((bool) $baja->active);
        $this->assertEquals(25.5, (float) $baja->cost);
    }

    public function test_actualiza_existentes_sin_pisar_costo_capturado(): void
    {
        $conCosto = Product::create([
            'name' => 'Peluche viejo', 'sku' => 'EXIST-1', 'cost' => 10, 'active' => true,
        ]);
        $curado = Product::create([
            'name' => 'Taza CSM', 'sku' => 'EXIST-2', 'cost' => 77, 'active' => true,
        ]);

        $this->runImport()->assertExitCode(0);

        // El origen trae costo 50 → sí se actualiza (junto con nombre)
        $conCosto->refresh();
        $this->assertSame('Peluche Totoro GRANDE', $conCosto->name);
        $this->assertEquals(50.0, (float) $conCosto->cost);
        $this->assertDatabaseHas('product_prices', [
            'product_id' => $conCosto->id, 'price_1' => 300.0, 'price_2' => 270.0,
        ]);

        // El origen trae costo 0 → el costo capturado en Tadaima NO se pisa
        $curado->refresh();
        $this->assertSame('Taza Chainsaw Man v2', $curado->name);
        $this->assertEquals(77.0, (float) $curado->cost);

        // No se duplicó: sigue habiendo UN producto por sku
        $this->assertSame(1, Product::where('sku', 'EXIST-1')->count());
    }

    public function test_duplicado_interno_gana_el_ultimo(): void
    {
        $this->runImport()->assertExitCode(0);

        $this->assertSame(1, Product::where('sku', '789555')->count());
        $dup = Product::where('sku', '789555')->first();
        $this->assertSame('Hanger repetido nuevo', $dup->name);
        $this->assertDatabaseHas('product_prices', ['product_id' => $dup->id, 'price_1' => 20.0]);
        $this->assertDatabaseHas('inventory', [
            'product_id' => $dup->id, 'warehouse_id' => $this->exhibicion->id, 'quantity' => 3.0,
        ]);
    }

    public function test_es_idempotente_re_correr_no_duplica(): void
    {
        $this->runImport()->assertExitCode(0);
        $productos = Product::count();
        $movimientos = \DB::table('inventory_movements')->count();

        $this->runImport()->assertExitCode(0);

        $this->assertSame($productos, Product::count());
        // stock sin cambios → delta 0 → ningún movimiento nuevo
        $this->assertSame($movimientos, \DB::table('inventory_movements')->count());
        $this->assertSame(1, \DB::table('product_manga_details')->count());
    }

    public function test_dry_run_no_escribe_nada(): void
    {
        $this->runImport(['--dry-run' => true], confirm: false)->assertExitCode(0);

        $this->assertSame(0, Product::count());
        $this->assertSame(0, \DB::table('product_categories')->count());
        $this->assertSame(0, \DB::table('inventory')->count());
    }

    public function test_ref_default_es_la_fecha_de_hoy(): void
    {
        // Sin --ref: cada corrida se firma con import-macro-YYYYMMDD para que
        // los re-imports sean distinguibles (antes era una constante fija).
        $this->runImport(['--ref' => null])->assertExitCode(0);

        $fig = Product::where('sku', '789111')->first();
        $this->assertDatabaseHas('inventory_movements', [
            'product_id' => $fig->id,
            'reference' => 'import-macro-'.now()->format('Ymd'),
        ]);
    }

    public function test_pisar_ceros_pone_en_cero_lo_que_el_origen_ya_no_tiene(): void
    {
        // El manga 789222 viene con existencia 0 en el staging, pero en Tadaima
        // tiene 4 piezas — con --pisar-ceros el origen es la verdad: queda en 0
        // con un ajuste negativo trazable.
        $manga = Product::create(['name' => 'Manga Frieren 01', 'sku' => '789222', 'active' => true]);
        \DB::table('inventory')->insert([
            'product_id' => $manga->id, 'warehouse_id' => $this->exhibicion->id,
            'quantity' => 4, 'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->runImport(['--pisar-ceros' => true])->assertExitCode(0);

        $this->assertDatabaseHas('inventory', [
            'product_id' => $manga->id, 'warehouse_id' => $this->exhibicion->id, 'quantity' => 0.0,
        ]);
        $this->assertDatabaseHas('inventory_movements', [
            'product_id' => $manga->id, 'type' => 'ajuste',
            'quantity' => -4.0, 'reference' => 'import-macro-test',
        ]);
    }

    public function test_sin_pisar_ceros_conserva_stock_operado_en_tadaima(): void
    {
        // Comportamiento original: existencia 0 en el origen NO borra stock local.
        $manga = Product::create(['name' => 'Manga Frieren 01', 'sku' => '789222', 'active' => true]);
        \DB::table('inventory')->insert([
            'product_id' => $manga->id, 'warehouse_id' => $this->exhibicion->id,
            'quantity' => 4, 'created_at' => now(), 'updated_at' => now(),
        ]);

        // verify() solo compara los SKUs con existencia > 0 cuando NO se pisan
        // ceros (el contrato es "0 en el origen no toca inventario"): ✓
        $this->runImport()->assertExitCode(0);

        $this->assertDatabaseHas('inventory', [
            'product_id' => $manga->id, 'warehouse_id' => $this->exhibicion->id, 'quantity' => 4.0,
        ]);
    }

    // ── Filtros del import de Centro (2026-08-17) ────────────────────────────

    /** Corre el comando con la fixture de Centro y --force (sin prompt). */
    private function runCentro(array $extra = [])
    {
        return $this->artisan('tadaima:import-macro', array_merge([
            'file' => base_path('tests/Fixtures/centro-articulos-sample.json'),
            '--connection' => config('database.default'),
            '--unsafe-host' => true,
            '--store' => 'Tadaima MACRO',
            '--user' => (string) $this->admin->id,
            '--ref' => 'import-centro-test',
            '--force' => true,
        ], $extra));
    }

    private const FILTROS_CENTRO = [
        '--desde-fecha' => '2025-01-01',
        '--solo-con-stock' => true,
        '--libreria-sin-stock' => true,
    ];

    public function test_filtros_fecha_stock_y_libreria(): void
    {
        $this->runCentro(self::FILTROS_CENTRO)->assertExitCode(0);

        // Entra: 2025 con stock
        $fig = Product::where('sku', 'C-FIG-2025-STOCK')->first();
        $this->assertNotNull($fig);
        $this->assertDatabaseHas('inventory', [
            'product_id' => $fig->id, 'warehouse_id' => $this->exhibicion->id, 'quantity' => 3.0,
        ]);
        $this->assertDatabaseHas('product_prices', ['product_id' => $fig->id, 'price_1' => 250.0, 'price_2' => 225.0]);

        // Fuera: 2025 sin stock (no librería), 2024 con stock (fecha), sin fecha
        $this->assertNull(Product::where('sku', 'C-FIG-2025-SIN')->first());
        $this->assertNull(Product::where('sku', 'C-FIG-2024-STOCK')->first());
        $this->assertNull(Product::where('sku', 'C-SINFECHA')->first());

        // Librería 2025 sin stock entra igual (manga con detalle + precio, sin inventario)
        $manga = Product::where('sku', 'C-MANGA-2025-SIN')->first();
        $this->assertNotNull($manga);
        $this->assertSame('manga', $manga->product_type);
        $this->assertDatabaseHas('product_manga_details', ['product_id' => $manga->id]);
        $this->assertDatabaseHas('product_prices', ['product_id' => $manga->id, 'price_1' => 169.0, 'price_2' => 152.0]);
        $this->assertDatabaseMissing('inventory', ['product_id' => $manga->id]);

        // Librería por patrón "libro" (no manga) → product con su categoría
        $libro = Product::where('sku', 'C-LIBRO-2025-SIN')->first();
        $this->assertNotNull($libro);
        $this->assertSame('product', $libro->product_type);
        $this->assertSame('Libros', $libro->category?->name);

        // Librería 2024 queda fuera: el filtro de fecha SÍ aplica a la librería
        $this->assertNull(Product::where('sku', 'C-MANGA-2024-SIN')->first());

        // Los "existentes" de la fixture aquí no existían → entran como nuevos
        $this->assertSame(6, Product::count());
    }

    public function test_existentes_solo_stock_no_pisa_datos_solo_inventario(): void
    {
        $peluche = Product::create(['name' => 'Peluche viejo', 'sku' => 'C-EXIST-STOCK', 'cost' => 10, 'active' => true]);
        \DB::table('product_prices')->insert([
            'product_id' => $peluche->id, 'price_1' => 300, 'price_2' => 270,
            'created_at' => now(), 'updated_at' => now(),
        ]);
        $mangaExist = Product::create(['name' => 'Manga Frieren 01', 'sku' => 'C-EXIST-SIN', 'product_type' => 'manga', 'active' => true]);
        $taza = Product::create(['name' => 'Taza CSM', 'sku' => 'C-EXIST-STOCK-PREV', 'active' => true]);
        \DB::table('inventory')->insert([
            'product_id' => $taza->id, 'warehouse_id' => $this->exhibicion->id,
            'quantity' => 2, 'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->runCentro(self::FILTROS_CENTRO + ['--existentes-solo-stock' => true])->assertExitCode(0);

        // Existente con stock: nombre/costo/precio INTACTOS, solo inventario + entrada
        $peluche->refresh();
        $this->assertSame('Peluche viejo', $peluche->name);
        $this->assertEquals(10.0, (float) $peluche->cost);
        $this->assertNull($peluche->category_id);
        $this->assertDatabaseHas('product_prices', ['product_id' => $peluche->id, 'price_1' => 300.0, 'price_2' => 270.0]);
        $this->assertDatabaseHas('inventory', [
            'product_id' => $peluche->id, 'warehouse_id' => $this->exhibicion->id, 'quantity' => 4.0,
        ]);
        $this->assertDatabaseHas('inventory_movements', [
            'product_id' => $peluche->id, 'type' => 'entrada', 'quantity' => 4.0, 'reference' => 'import-centro-test',
        ]);
        // Su categoría (solo usada por un existente) NO se crea
        $this->assertDatabaseMissing('product_categories', ['name' => 'Peluches']);

        // Existente sin stock (librería): no se toca nada
        $this->assertDatabaseMissing('inventory', ['product_id' => $mangaExist->id]);
        $this->assertDatabaseMissing('inventory_movements', ['product_id' => $mangaExist->id]);
        $this->assertDatabaseMissing('product_prices', ['product_id' => $mangaExist->id]);

        // Existente con stock previo: absoluto 6 con ajuste +4
        $this->assertDatabaseHas('inventory', [
            'product_id' => $taza->id, 'warehouse_id' => $this->exhibicion->id, 'quantity' => 6.0,
        ]);
        $this->assertDatabaseHas('inventory_movements', [
            'product_id' => $taza->id, 'type' => 'ajuste', 'quantity' => 4.0, 'reference' => 'import-centro-test',
        ]);

        // Los nuevos siguen entrando completos (categoría creada, precio)
        $this->assertDatabaseHas('product_categories', ['name' => 'Figuras']);
        $this->assertSame(3 + 3, Product::count());
    }

    public function test_desde_fecha_invalida_falla_sin_escribir(): void
    {
        $this->runCentro(['--desde-fecha' => '2025-13-99'])->assertExitCode(1);
        $this->assertSame(0, Product::count());
    }

    public function test_dry_run_con_filtros_no_escribe_nada(): void
    {
        $this->runCentro(self::FILTROS_CENTRO + ['--existentes-solo-stock' => true, '--dry-run' => true])
            ->assertExitCode(0);
        $this->assertSame(0, Product::count());
        $this->assertSame(0, \DB::table('inventory')->count());
    }

    public function test_guard_rechaza_host_no_supabase_sin_flag(): void
    {
        $this->artisan('tadaima:import-macro', [
            'file' => $this->fixture,
            '--connection' => config('database.default'),
        ])->assertExitCode(1);

        $this->assertSame(0, Product::count());
    }

    public function test_falla_si_no_existe_la_tienda_destino(): void
    {
        $this->artisan('tadaima:import-macro', [
            'file' => $this->fixture,
            '--connection' => config('database.default'),
            '--unsafe-host' => true,
            '--store' => 'Tienda Inexistente',
        ])->assertExitCode(1);
    }
}
