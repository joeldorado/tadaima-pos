<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Product;
use App\Models\ProductCategory;
use App\Models\ProductStorePrice;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Feature\Concerns\BuildsBundleWorld;
use Tests\TestCase;

/**
 * Huecos de auditoría tapados el 2026-10-29 para el módulo "Actividad":
 * - el stock de tomos (PUT /manga-inventory) no dejaba rastro;
 * - un ajuste sin cambio real (mismo stock) generaba movimientos "0 → 0";
 * - editar precios / métodos de pago / categorías dejaba `changes: []`;
 * - los precios por tienda no se registraban.
 */
class ActivityLoggingTest extends TestCase
{
    use BuildsBundleWorld;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buildBundleWorld();
    }

    private function logs(string $action, int $entityId): \Illuminate\Support\Collection
    {
        return DB::table('system_logs')->where('action', $action)->where('entity_id', $entityId)->get()
            ->map(fn ($row) => json_decode((string) $row->meta, true));
    }

    private function movements(Product $product): \Illuminate\Support\Collection
    {
        return DB::table('inventory_movements')->where('product_id', $product->id)->get();
    }

    public function test_ajuste_de_stock_de_tomo_deja_movimiento_y_log(): void
    {
        $tomo = $this->makeProduct('Tomo 1', 70, 100, Product::TYPE_MANGA);

        $this->actingAs($this->gerenteA)
            ->putJson("/api/v1/manga-inventory/{$tomo->id}/{$this->exhA->id}", ['quantity' => 5])
            ->assertOk();

        $this->assertSame(5.0, $this->qty($tomo, $this->exhA));

        $movs = $this->movements($tomo);
        $this->assertCount(1, $movs);
        $this->assertSame('ajuste', $movs[0]->type);
        $this->assertSame(5.0, (float) $movs[0]->quantity);
        $this->assertSame($this->gerenteA->id, (int) $movs[0]->user_id);
        $this->assertSame($this->exhA->id, (int) $movs[0]->warehouse_id);

        $logs = $this->logs('inventory.adjusted', $tomo->id);
        $this->assertCount(1, $logs);
        $this->assertSame(0.0, (float) $logs[0]['old']);
        $this->assertSame(5.0, (float) $logs[0]['new']);
        $this->assertSame(5.0, (float) $logs[0]['delta']);
        $this->assertSame($this->exhA->id, (int) $logs[0]['warehouse_id']);
    }

    public function test_ajuste_sin_cambio_no_deja_movimiento_ni_log(): void
    {
        $product = $this->makeProduct('Funko');
        $this->stock($product, $this->exhA, 3);

        $this->actingAs($this->admin)
            ->putJson("/api/v1/inventory/{$product->id}/{$this->exhA->id}", ['quantity' => 3])
            ->assertOk();

        $this->assertCount(0, $this->movements($product), 'un ajuste 3 → 3 no es un movimiento');
        $this->assertCount(0, $this->logs('inventory.adjusted', $product->id));

        // Bodega sin fila de inventory: 0 → 0 tampoco deja rastro (modal de editar producto).
        $this->actingAs($this->admin)
            ->putJson("/api/v1/inventory/{$product->id}/{$this->bodA->id}", ['quantity' => 0])
            ->assertOk();

        $this->assertCount(0, $this->movements($product));
        $this->assertCount(0, $this->logs('inventory.adjusted', $product->id));
        $this->assertSame(0.0, $this->qty($product, $this->bodA));
    }

    public function test_ajuste_con_cambio_sigue_dejando_movimiento_y_log(): void
    {
        $product = $this->makeProduct('Funko');
        $this->stock($product, $this->exhA, 3);

        $this->actingAs($this->admin)
            ->putJson("/api/v1/inventory/{$product->id}/{$this->exhA->id}", ['quantity' => 1, 'notes' => 'Conteo físico'])
            ->assertOk();

        $movs = $this->movements($product);
        $this->assertCount(1, $movs);
        $this->assertSame(-2.0, (float) $movs[0]->quantity);
        $this->assertSame('Conteo físico', $movs[0]->notes);

        $logs = $this->logs('inventory.adjusted', $product->id);
        $this->assertCount(1, $logs);
        $this->assertSame(3.0, (float) $logs[0]['old']);
        $this->assertSame(1.0, (float) $logs[0]['new']);
    }

    public function test_cambiar_solo_el_precio_a_queda_en_el_diff_del_producto(): void
    {
        $product = $this->makeProduct('Funko', 40, 100);

        $this->actingAs($this->admin)
            ->putJson("/api/v1/products/{$product->id}", ['prices' => ['price_1' => 120]])
            ->assertOk();

        $logs = $this->logs('product.updated', $product->id);
        $this->assertCount(1, $logs);
        $changes = $logs[0]['changes'];
        $this->assertEqualsWithDelta(100.0, $changes['prices.price_1']['old'], 0.001);
        $this->assertEqualsWithDelta(120.0, $changes['prices.price_1']['new'], 0.001);
        $this->assertArrayNotHasKey('prices.price_2', $changes);
        $this->assertArrayNotHasKey('name', $changes);
    }

    public function test_editar_producto_sin_cambio_real_no_deja_log(): void
    {
        $product = $this->makeProduct('Funko', 40, 100);
        $product->paymentMethod()->create(['allow_cash' => true, 'allow_card' => true]);

        // Mismo nombre, mismo precio, mismos métodos: es lo que manda el modal al guardar sin tocar nada.
        $this->actingAs($this->admin)
            ->putJson("/api/v1/products/{$product->id}", [
                'name' => 'Funko',
                'prices' => ['price_1' => 100],
                'allow_cash' => true,
                'allow_card' => true,
            ])
            ->assertOk();

        $this->assertCount(0, $this->logs('product.updated', $product->id));
    }

    public function test_metodos_de_pago_y_categorias_quedan_en_el_diff(): void
    {
        $product = $this->makeProduct('Funko');
        $product->paymentMethod()->create(['allow_cash' => true, 'allow_card' => true]);
        $catA = ProductCategory::create(['name' => 'Figuras', 'active' => true]);
        $catB = ProductCategory::create(['name' => 'Anime', 'active' => true]);
        $product->syncCategories([$catA->id]);

        $this->actingAs($this->admin)
            ->putJson("/api/v1/products/{$product->id}", [
                'allow_card' => false,
                'category_ids' => [$catB->id, $catA->id],
            ])
            ->assertOk();

        $logs = $this->logs('product.updated', $product->id);
        $this->assertCount(1, $logs);
        $changes = $logs[0]['changes'];
        $this->assertSame(['old' => true, 'new' => false], $changes['payment.allow_card']);
        $this->assertArrayNotHasKey('payment.allow_cash', $changes);
        $this->assertSame([$catA->id], $changes['categories']['old']);
        $this->assertSame([$catA->id, $catB->id], $changes['categories']['new'], 'ids ordenados');
    }

    public function test_cambiar_solo_el_precio_b_de_un_tomo_queda_en_el_diff(): void
    {
        $tomo = $this->makeProduct('Tomo 1', 70, 100, Product::TYPE_MANGA);
        $tomo->price()->update(['price_2' => 90]);

        $this->actingAs($this->admin)
            ->putJson("/api/v1/mangas/{$tomo->id}", ['price_1' => 100, 'price_2' => 80])
            ->assertOk();

        $logs = $this->logs('manga.updated', $tomo->id);
        $this->assertCount(1, $logs);
        $changes = $logs[0]['changes'];
        $this->assertEqualsWithDelta(90.0, $changes['prices.price_2']['old'], 0.001);
        $this->assertEqualsWithDelta(80.0, $changes['prices.price_2']['new'], 0.001);
        $this->assertArrayNotHasKey('prices.price_1', $changes);
    }

    public function test_precio_por_tienda_deja_log_al_actualizar_y_al_quitar(): void
    {
        $product = $this->makeProduct('Funko');
        ProductStorePrice::create(['product_id' => $product->id, 'store_id' => $this->storeA->id, 'price_level' => 1, 'price' => 150]);

        $this->actingAs($this->admin)
            ->putJson("/api/v1/products/{$product->id}/store-prices/{$this->storeA->id}", ['price_1' => 160, 'price_2' => 140])
            ->assertOk();

        $logs = $this->logs('product.store_price_updated', $product->id);
        $this->assertCount(1, $logs);
        $this->assertSame($this->storeA->id, (int) $logs[0]['store_id']);
        $this->assertSame('Macro', $logs[0]['store_name']);
        $this->assertEqualsWithDelta(150.0, $logs[0]['old']['price_1'], 0.001);
        $this->assertArrayNotHasKey('price_2', $logs[0]['old']);
        $this->assertEqualsWithDelta(160.0, $logs[0]['new']['price_1'], 0.001);
        $this->assertEqualsWithDelta(140.0, $logs[0]['new']['price_2'], 0.001);

        // Mismo payload otra vez: nada cambió, no hay segundo log.
        $this->actingAs($this->admin)
            ->putJson("/api/v1/products/{$product->id}/store-prices/{$this->storeA->id}", ['price_1' => 160, 'price_2' => 140])
            ->assertOk();
        $this->assertCount(1, $this->logs('product.store_price_updated', $product->id));

        $this->actingAs($this->admin)
            ->deleteJson("/api/v1/products/{$product->id}/store-prices/{$this->storeA->id}")
            ->assertOk();

        $removed = $this->logs('product.store_price_removed', $product->id);
        $this->assertCount(1, $removed);
        $this->assertEqualsWithDelta(160.0, $removed[0]['old']['price_1'], 0.001);
        $this->assertSame([], $removed[0]['new']);
    }
}
