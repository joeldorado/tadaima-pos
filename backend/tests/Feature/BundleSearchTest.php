<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Product;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Concerns\BuildsBundleWorld;
use Tests\TestCase;

/** Paquetes (2026-10-07): Caja lo encuentra como producto; Productos no lo lista. */
class BundleSearchTest extends TestCase
{
    use BuildsBundleWorld;
    use RefreshDatabase;

    private Product $bundle;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buildBundleWorld();
        $a = $this->makeProduct('A', 10, 50);
        $b = $this->makeProduct('B', 10, 50);
        $this->bundle = $this->createBundle([['product_id' => $a->id, 'quantity' => 1], ['product_id' => $b->id, 'quantity' => 1]], 90);
        $this->stock($a, $this->exhA, 2);
        $this->stock($b, $this->exhA, 2);
        $this->assemble($this->bundle, $this->storeA, 2)->assertOk();
    }

    public function test_caja_lo_encuentra_por_sku_y_barcode(): void
    {
        $bySku = $this->actingAs($this->cajeroA)->getJson("/api/v1/products?light=1&store_id={$this->storeA->id}&search=PAQ-0001");
        $bySku->assertOk();
        $row = collect($bySku->json('data.data') ?? $bySku->json('data'))->firstWhere('sku', 'PAQ-0001');
        $this->assertNotNull($row);
        $this->assertSame('bundle', $row['product_type']);
        $this->assertSame(2.0, (float) $row['stock_total']);
        $this->assertSame(90.0, (float) $row['prices']['price_1']);

        $byBarcode = $this->actingAs($this->cajeroA)->getJson("/api/v1/products?light=1&store_id={$this->storeA->id}&search={$this->bundle->barcode}");
        $byBarcode->assertOk();
        $this->assertNotNull(collect($byBarcode->json('data.data') ?? $byBarcode->json('data'))->firstWhere('id', $this->bundle->id));

        $this->actingAs($this->cajeroA)->getJson('/api/v1/products/lookup?code=paq-0001')
            ->assertOk()->assertJsonPath('data.0.id', $this->bundle->id);
    }

    public function test_purga_sin_stock_respeta_componentes_y_paquetes(): void
    {
        // A quedó en 0 en Exhibición porque sus piezas están armadas: no es basura.
        $a = Product::where('name', 'A')->firstOrFail();
        $this->assertSame(0.0, $this->qty($a, $this->exhA));

        $this->artisan('tadaima:purge-no-stock', [
            '--connection' => config('database.default'), '--unsafe-host' => true,
            '--user' => (string) $this->admin->id, '--force' => true,
        ])->assertExitCode(0);

        $this->assertDatabaseHas('products', ['id' => $a->id]);
        $this->assertDatabaseHas('products', ['id' => $this->bundle->id]);
    }

    public function test_productos_no_lo_lista_y_stats_lo_separa(): void
    {
        $list = $this->actingAs($this->admin)->getJson('/api/v1/products?type=product');
        $list->assertOk();
        $ids = collect($list->json('data.data') ?? $list->json('data'))->pluck('id');
        $this->assertFalse($ids->contains($this->bundle->id));

        $bundles = $this->actingAs($this->admin)->getJson('/api/v1/products?type=bundle');
        $this->assertTrue(collect($bundles->json('data.data') ?? $bundles->json('data'))->pluck('id')->contains($this->bundle->id));

        $this->actingAs($this->admin)->getJson('/api/v1/products/stats')
            ->assertOk()
            ->assertJsonPath('data.total', 3)
            ->assertJsonPath('data.total_bundles', 1)
            ->assertJsonPath('data.total_productos', 2);
    }
}
