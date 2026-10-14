<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Product;
use App\Support\BundleCost;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Feature\Concerns\BuildsBundleWorld;
use Tests\TestCase;

/**
 * Costo del paquete al cambiar el costo de una pieza (2026-10-14). Antes solo
 * se recalculaba al crear/editar/armar: si cambiaba el costo de una pieza, el
 * paquete se vendía con el costo viejo congelado en `sale_items.cost`.
 */
class BundleCostSyncTest extends TestCase
{
    use BuildsBundleWorld;
    use RefreshDatabase;

    private Product $goku;

    private Product $vegeta;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buildBundleWorld();
        $this->goku = $this->makeProduct('Funko Goku', 40, 110);
        $this->vegeta = $this->makeProduct('Funko Vegeta', 60, 100);
    }

    private function bundleOf(Product $a, int $qtyA, Product $b, int $qtyB): Product
    {
        return $this->createBundle([
            ['product_id' => $a->id, 'quantity' => $qtyA],
            ['product_id' => $b->id, 'quantity' => $qtyB],
        ]);
    }

    private function costOf(Product $bundle): ?float
    {
        $cost = $bundle->fresh()->cost;

        return $cost !== null ? (float) $cost : null;
    }

    public function test_editar_el_costo_de_una_pieza_recalcula_el_paquete(): void
    {
        $bundle = $this->bundleOf($this->goku, 2, $this->vegeta, 1);
        $otra = $this->makeProduct('Funko Piccolo', 30, 90);
        $ajeno = $this->bundleOf($this->vegeta, 1, $otra, 1);
        $this->assertEqualsWithDelta(140.0, $this->costOf($bundle), 0.001); // 2×40 + 60
        $this->assertEqualsWithDelta(90.0, $this->costOf($ajeno), 0.001);

        $this->actingAs($this->admin)->putJson("/api/v1/products/{$this->goku->id}", ['cost' => 50])->assertOk();

        $this->assertEqualsWithDelta(160.0, $this->costOf($bundle), 0.001); // 2×50 + 60
        $this->assertEqualsWithDelta(90.0, $this->costOf($ajeno), 0.001, 'un paquete que no lleva la pieza no cambia');

        $log = DB::table('system_logs')->where('action', 'product.updated')->where('entity_id', $this->goku->id)->first();
        $meta = json_decode((string) $log->meta, true);
        $this->assertEqualsWithDelta(160.0, $meta['bundles_cost'][(string) $bundle->id]['new'], 0.001);
    }

    public function test_pieza_sin_costo_deja_el_paquete_sin_costo_y_vuelve_al_capturarlo(): void
    {
        $bundle = $this->bundleOf($this->goku, 2, $this->vegeta, 1);

        $this->actingAs($this->admin)->putJson("/api/v1/products/{$this->vegeta->id}", ['cost' => null])->assertOk();
        $this->assertNull($this->costOf($bundle));

        $this->actingAs($this->admin)->putJson("/api/v1/products/{$this->vegeta->id}", ['cost' => 65])->assertOk();
        $this->assertEqualsWithDelta(145.0, $this->costOf($bundle), 0.001); // 2×40 + 65
    }

    public function test_editar_otro_campo_no_toca_el_paquete(): void
    {
        $bundle = $this->bundleOf($this->goku, 2, $this->vegeta, 1);
        DB::table('products')->where('id', $bundle->id)->update(['cost' => 999]);

        $this->actingAs($this->admin)->putJson("/api/v1/products/{$this->goku->id}", ['name' => 'Funko Goku SSJ'])->assertOk();

        $this->assertEqualsWithDelta(999.0, $this->costOf($bundle), 0.001, 'sin cambio de costo no se recalcula');
    }

    public function test_cambiar_el_precio_de_un_tomo_recalcula_el_paquete(): void
    {
        $tomo = $this->makeProduct('Tomo 1 Frieren', 70, 100, Product::TYPE_MANGA); // margen 30%
        $bundle = $this->bundleOf($tomo, 1, $this->vegeta, 1);
        $this->assertEqualsWithDelta(130.0, $this->costOf($bundle), 0.001);

        $this->actingAs($this->admin)->putJson("/api/v1/mangas/{$tomo->id}", ['price_1' => 200])->assertOk();

        $this->assertEqualsWithDelta(140.0, (float) $tomo->fresh()->cost, 0.001); // 200 × 0.70
        $this->assertEqualsWithDelta(200.0, $this->costOf($bundle), 0.001);
    }

    public function test_homologar_costo_tomos_y_revertir_recalculan_el_paquete(): void
    {
        $tomo = $this->makeProduct('Tomo 2 Frieren', null, 200, Product::TYPE_MANGA);
        $bundle = $this->bundleOf($tomo, 2, $this->vegeta, 1);
        $this->assertNull($this->costOf($bundle));

        $this->artisan('tadaima:homologar-costo-tomos', [
            '--connection' => config('database.default'),
            '--unsafe-host' => true,
            '--user' => (string) $this->admin->id,
            '--force' => true,
        ])->assertExitCode(0);

        $this->assertEqualsWithDelta(340.0, $this->costOf($bundle), 0.001); // 2×140 + 60
        $logId = (int) DB::table('system_logs')->where('action', 'products.tomos_costo_homologado')->value('id');

        $this->artisan('tadaima:homologar-costo-tomos', [
            '--connection' => config('database.default'),
            '--unsafe-host' => true,
            '--user' => (string) $this->admin->id,
            '--force' => true,
            '--revertir' => (string) $logId,
        ])->assertExitCode(0);

        $this->assertNull($tomo->fresh()->cost);
        $this->assertNull($this->costOf($bundle));
    }

    public function test_import_macro_con_costo_nuevo_recalcula_el_paquete(): void
    {
        $peluche = Product::create(['name' => 'Peluche viejo', 'sku' => 'EXIST-1', 'cost' => 10, 'active' => true]);
        $bundle = $this->bundleOf($peluche, 2, $this->vegeta, 1);
        $this->assertEqualsWithDelta(80.0, $this->costOf($bundle), 0.001);

        $this->artisan('tadaima:import-macro', [
            'file' => base_path('tests/Fixtures/macro-articulos-sample.json'),
            '--connection' => config('database.default'),
            '--unsafe-host' => true,
            '--store' => $this->storeA->name,
            '--user' => (string) $this->admin->id,
            '--ref' => 'import-macro-test',
            '--force' => true,
        ])->assertExitCode(0);

        $this->assertEqualsWithDelta(50.0, (float) $peluche->fresh()->cost, 0.001); // la fixture trae costo 50
        $this->assertEqualsWithDelta(160.0, $this->costOf($bundle), 0.001); // 2×50 + 60
    }

    public function test_compute_es_null_si_falta_un_costo_o_no_hay_piezas(): void
    {
        $this->assertSame(110.5, BundleCost::compute([['cost' => '25.25', 'quantity' => 2], ['cost' => 60, 'quantity' => 1]]));
        $this->assertNull(BundleCost::compute([['cost' => 40, 'quantity' => 2], ['cost' => 0, 'quantity' => 1]]));
        $this->assertNull(BundleCost::compute([['cost' => null, 'quantity' => 1]]));
        $this->assertNull(BundleCost::compute([]));
    }
}
