<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Product;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\Store;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * tadaima:homologar-costo-tomos (Joel 2026-10-03): costo de TODOS los tomos =
 * precio A × 0.70. Los tomos llegaron del POS viejo sin costo y un bug del
 * modal dejó algunos con costo = precio. Solo toca `products.cost` de
 * `product_type='manga'`; nada de inventario, precios, productos ni ventas.
 */
class HomologarCostoTomosTest extends TestCase
{
    use RefreshDatabase;

    private Store $store;

    private Warehouse $warehouse;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $company = Company::create(['name' => 'Test Co']);
        $this->store = Store::create(['company_id' => $company->id, 'name' => 'Tienda', 'active' => true]);
        $this->warehouse = Warehouse::create([
            'company_id' => $company->id, 'store_id' => $this->store->id,
            'name' => 'Exhibición', 'type' => 'store', 'active' => true,
        ]);
        $this->admin = User::create([
            'name' => 'Admin', 'email' => 'homologar@test.com', 'password' => bcrypt('x'),
            'company_id' => $company->id,
        ]);
    }

    private function make(string $name, string $type, ?float $precioA, ?float $costo, float $stock = 0): Product
    {
        $p = Product::create([
            'name' => $name, 'sku' => 'SKU-'.uniqid(), 'active' => true,
            'product_type' => $type, 'cost' => $costo,
        ]);
        if ($precioA !== null) {
            $p->price()->create(['price_1' => $precioA, 'price_2' => round($precioA * 0.9)]);
        }
        if ($stock > 0) {
            DB::table('inventory')->insert([
                'product_id' => $p->id, 'warehouse_id' => $this->warehouse->id,
                'quantity' => $stock, 'created_at' => now(), 'updated_at' => now(),
            ]);
        }

        return $p;
    }

    private function runHomologar(array $extra = [])
    {
        return $this->artisan('tadaima:homologar-costo-tomos', array_merge([
            '--connection' => config('database.default'),
            '--unsafe-host' => true,
            '--user' => (string) $this->admin->id,
            '--force' => true,
        ], $extra));
    }

    private function logHomologado(): ?object
    {
        return DB::table('system_logs')->where('action', 'products.tomos_costo_homologado')->orderByDesc('id')->first();
    }

    public function test_homologa_sin_costo_costo_igual_precio_y_otro_costo(): void
    {
        $sinCosto = $this->make('Tomo 19 MHA', Product::TYPE_MANGA, 159, null);
        $igualPrecio = $this->make('Tomo 0 Jujutsu kaisen', Product::TYPE_MANGA, 169, 169);
        $otroCosto = $this->make('Tomo 3 Dakaichi', Product::TYPE_MANGA, 169, 69.30);

        $this->runHomologar()->assertExitCode(0);

        $this->assertEqualsWithDelta(111.30, (float) $sinCosto->fresh()->cost, 0.001);
        $this->assertEqualsWithDelta(118.30, (float) $igualPrecio->fresh()->cost, 0.001);
        $this->assertEqualsWithDelta(118.30, (float) $otroCosto->fresh()->cost, 0.001);
    }

    public function test_no_toca_los_que_ya_estan_en_regla(): void
    {
        $yaOk = $this->make('Tomo 1 Dandadan', Product::TYPE_MANGA, 179, 125.30);
        DB::table('products')->where('id', $yaOk->id)->update(['updated_at' => '2026-08-03 22:03:28']);

        $this->runHomologar()->assertExitCode(0);

        $row = DB::table('products')->where('id', $yaOk->id)->first();
        $this->assertEqualsWithDelta(125.30, (float) $row->cost, 0.001);
        $this->assertSame('2026-08-03 22:03:28', (string) $row->updated_at);
        $this->assertNull($this->logHomologado(), 'sin nada que escribir no deja registro');
    }

    public function test_no_toca_productos_normales_precios_inventario_ni_ventas(): void
    {
        $tomo = $this->make('Tomo 19 MHA', Product::TYPE_MANGA, 159, null, stock: 4);
        $figuraSinCosto = $this->make('Figura Goku', Product::TYPE_PRODUCT, 500, null, stock: 2);
        $figuraConCosto = $this->make('Pop Charizard', Product::TYPE_PRODUCT, 300, 210);

        $sale = Sale::create([
            'store_id' => $this->store->id, 'user_id' => $this->admin->id,
            'subtotal' => 159, 'discount' => 0, 'total' => 159, 'status' => Sale::STATUS_COMPLETED,
        ]);
        $item = SaleItem::create([
            'sale_id' => $sale->id, 'product_id' => $tomo->id,
            'quantity' => 1, 'price' => 159, 'total' => 159, 'cost' => null,
        ]);

        $preciosAntes = DB::table('product_prices')->orderBy('id')->get()->toArray();
        $inventarioAntes = DB::table('inventory')->orderBy('id')->get()->toArray();

        $this->runHomologar()->assertExitCode(0);

        $this->assertNull($figuraSinCosto->fresh()->cost, 'producto normal sin costo: intacto');
        $this->assertEqualsWithDelta(210.0, (float) $figuraConCosto->fresh()->cost, 0.001);
        $this->assertEquals($preciosAntes, DB::table('product_prices')->orderBy('id')->get()->toArray());
        $this->assertEquals($inventarioAntes, DB::table('inventory')->orderBy('id')->get()->toArray());
        $this->assertNull($item->fresh()->cost, 'el costo congelado de la venta no se toca');
    }

    public function test_tomo_sin_precio_se_omite(): void
    {
        $sinFila = $this->make('Tomo sin precio', Product::TYPE_MANGA, null, null);
        $precioCero = $this->make('Tomo precio cero', Product::TYPE_MANGA, 0, null);
        $normal = $this->make('Tomo 19 MHA', Product::TYPE_MANGA, 159, null);

        $this->runHomologar()->assertExitCode(0);

        $this->assertNull($sinFila->fresh()->cost);
        $this->assertNull($precioCero->fresh()->cost);
        $this->assertEqualsWithDelta(111.30, (float) $normal->fresh()->cost, 0.001);
    }

    public function test_dry_run_no_escribe_costos_ni_registro(): void
    {
        $tomo = $this->make('Tomo 19 MHA', Product::TYPE_MANGA, 159, null);

        $this->runHomologar(['--dry-run' => true])->assertExitCode(0);

        $this->assertNull($tomo->fresh()->cost);
        $this->assertNull($this->logHomologado());
    }

    public function test_es_idempotente(): void
    {
        $this->make('Tomo 19 MHA', Product::TYPE_MANGA, 159, null);
        $this->make('Tomo 0 Jujutsu kaisen', Product::TYPE_MANGA, 169, 169);

        $this->runHomologar()->assertExitCode(0);
        $this->runHomologar()->assertExitCode(0);

        $this->assertSame(1, DB::table('system_logs')->where('action', 'products.tomos_costo_homologado')->count());
    }

    public function test_registro_guarda_el_costo_anterior_y_el_nuevo(): void
    {
        $sinCosto = $this->make('Tomo 19 MHA', Product::TYPE_MANGA, 159, null);
        $igualPrecio = $this->make('Tomo 0 Jujutsu kaisen', Product::TYPE_MANGA, 169, 169);
        $this->make('Tomo 1 Dandadan', Product::TYPE_MANGA, 179, 125.30);

        $this->runHomologar()->assertExitCode(0);

        $log = $this->logHomologado();
        $this->assertNotNull($log);
        $this->assertSame($this->admin->id, (int) $log->user_id);
        $meta = json_decode((string) $log->meta, true);

        $this->assertSame(3, $meta['totales']['tomos']);
        $this->assertSame(2, $meta['totales']['escritos']);
        $this->assertSame(1, $meta['totales']['ya_ok']);
        $this->assertSame(1, $meta['totales']['desde_null']);
        $this->assertSame(1, $meta['totales']['desde_igual_precio']);
        $this->assertSame([$sinCosto->id], $meta['antes']['null']);
        $this->assertSame([(string) $igualPrecio->id => '169.00'], $meta['antes']['valores']);
        $this->assertSame([$sinCosto->id], $meta['despues']['111.30']);
        $this->assertSame([$igualPrecio->id], $meta['despues']['118.30']);
    }

    public function test_revertir_restaura_exactamente_el_costo_anterior(): void
    {
        $sinCosto = $this->make('Tomo 19 MHA', Product::TYPE_MANGA, 159, null);
        $igualPrecio = $this->make('Tomo 0 Jujutsu kaisen', Product::TYPE_MANGA, 169, 169);
        $otroCosto = $this->make('Tomo 3 Dakaichi', Product::TYPE_MANGA, 169, 69.30);

        $this->runHomologar()->assertExitCode(0);
        $logId = (string) $this->logHomologado()->id;
        $this->runHomologar(['--revertir' => $logId])->assertExitCode(0);

        $this->assertNull($sinCosto->fresh()->cost);
        $this->assertEqualsWithDelta(169.0, (float) $igualPrecio->fresh()->cost, 0.001);
        $this->assertEqualsWithDelta(69.30, (float) $otroCosto->fresh()->cost, 0.001);
        $this->assertSame(1, DB::table('system_logs')->where('action', 'products.tomos_costo_revertido')->count());
    }

    public function test_revertir_no_pisa_un_costo_editado_despues(): void
    {
        $editado = $this->make('Tomo 19 MHA', Product::TYPE_MANGA, 159, null);
        $intacto = $this->make('Tomo 1 Dandadan', Product::TYPE_MANGA, 179, null);

        $this->runHomologar()->assertExitCode(0);
        $logId = (string) $this->logHomologado()->id;
        DB::table('products')->where('id', $editado->id)->update(['cost' => 95.40]);

        $this->runHomologar(['--revertir' => $logId])->assertExitCode(0);

        $this->assertEqualsWithDelta(95.40, (float) $editado->fresh()->cost, 0.001, 'edición posterior: se respeta');
        $this->assertNull($intacto->fresh()->cost);
    }

    public function test_con_confirmacion_interactiva_escribe_y_registra_un_costo_capturado_a_mano(): void
    {
        // Sin --force pregunta antes de escribir. El "antes" del registro es el
        // costo que hay al escribir (se relee dentro de la transacción).
        $tomo = $this->make('Tomo 19 MHA', Product::TYPE_MANGA, 159, null);

        // El comando nombra el host del destino (o la conexión si no tiene host, como SQLite).
        $conn = config('database.default');
        $destino = config("database.connections.{$conn}.host") ?: $conn;

        $this->artisan('tadaima:homologar-costo-tomos', [
            '--connection' => $conn,
            '--unsafe-host' => true,
            '--user' => (string) $this->admin->id,
        ])->expectsConfirmation("¿Escribir el costo de 1 tomos en {$destino}?", 'yes')
            ->assertExitCode(0);
        $this->assertEqualsWithDelta(111.30, (float) $tomo->fresh()->cost, 0.001);

        // Un costo capturado a mano queda en el registro para poder revertirlo.
        $otro = $this->make('Tomo 1 Dandadan', Product::TYPE_MANGA, 179, null);
        DB::table('products')->where('id', $otro->id)->update(['cost' => 95.40]);
        $this->runHomologar()->assertExitCode(0);

        $meta = json_decode((string) $this->logHomologado()->meta, true);
        $this->assertSame([(string) $otro->id => '95.40'], $meta['antes']['valores']);
        $this->assertSame([], $meta['antes']['null']);
    }

    public function test_revertir_con_dry_run_no_escribe(): void
    {
        $tomo = $this->make('Tomo 19 MHA', Product::TYPE_MANGA, 159, null);

        $this->runHomologar()->assertExitCode(0);
        $logId = (string) $this->logHomologado()->id;
        $this->runHomologar(['--revertir' => $logId, '--dry-run' => true])->assertExitCode(0);

        $this->assertEqualsWithDelta(111.30, (float) $tomo->fresh()->cost, 0.001);
    }

    public function test_revertir_rechaza_un_registro_que_no_es_de_homologacion(): void
    {
        $otroLog = DB::table('system_logs')->insertGetId([
            'user_id' => $this->admin->id, 'action' => 'product.updated',
            'description' => 'x', 'created_at' => now(),
        ]);

        $this->runHomologar(['--revertir' => (string) $otroLog])->assertExitCode(1);
        $this->runHomologar(['--revertir' => '999999'])->assertExitCode(1);
    }

    public function test_rechaza_un_host_que_no_es_supabase(): void
    {
        $tomo = $this->make('Tomo 19 MHA', Product::TYPE_MANGA, 159, null);

        $this->artisan('tadaima:homologar-costo-tomos', [
            '--connection' => config('database.default'),
            '--force' => true,
        ])->assertExitCode(1);

        $this->assertNull($tomo->fresh()->cost);
    }

    public function test_escribe_por_conjuntos_no_fila_por_fila(): void
    {
        foreach ([159, 179, 199] as $precio) {
            for ($i = 0; $i < 100; $i++) {
                $this->make("Tomo {$i} serie {$precio}", Product::TYPE_MANGA, $precio, null);
            }
        }

        DB::enableQueryLog();
        $this->runHomologar()->assertExitCode(0);
        $updates = array_filter(DB::getQueryLog(), fn ($q) => str_starts_with(strtolower($q['query']), 'update "products"'));
        DB::disableQueryLog();

        $this->assertLessThan(10, count($updates), '300 tomos con 3 precios = 3 UPDATE, no 300');
        $this->assertSame(300, Product::where('product_type', 'manga')->whereNotNull('cost')->count());
    }

    public function test_exporta_csv_con_antes_y_despues(): void
    {
        $this->make('Tomo 19 MHA', Product::TYPE_MANGA, 159, null);
        $csv = sys_get_temp_dir().'/homologar-'.uniqid().'.csv';

        $this->runHomologar(['--dry-run' => true, '--csv' => $csv])->assertExitCode(0);

        $this->assertFileExists($csv);
        $lineas = array_map('str_getcsv', file($csv, FILE_IGNORE_NEW_LINES));
        @unlink($csv);
        $this->assertSame(['id', 'sku', 'nombre', 'precio_a', 'costo_antes', 'costo_despues', 'estado'], $lineas[0]);
        $this->assertSame('159.00', $lineas[1][3]);
        $this->assertSame('', $lineas[1][4]);
        $this->assertSame('111.30', $lineas[1][5]);
        $this->assertSame('sin_costo', $lineas[1][6]);
    }
}
