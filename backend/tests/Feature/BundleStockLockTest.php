<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Product;
use App\Models\ProductBundleItem;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Concerns\BuildsBundleWorld;
use Tests\TestCase;

/**
 * Paquetes (2026-10-08): el candado de borrar / editar composición mira CADA
 * fila de `inventory` del paquete (≠ 0), no la suma: una fila negativa en otra
 * tienda (ajuste viejo) podía dejar la suma en 0 y colar el borrado con
 * paquetes armados. Y "puedes armar N" trata el stock negativo de un
 * componente como 0, exactamente igual que `assemble`.
 */
class BundleStockLockTest extends TestCase
{
    use BuildsBundleWorld;
    use RefreshDatabase;

    private Product $a;

    private Product $b;

    private Product $bundle;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buildBundleWorld();
        $this->a = $this->makeProduct('Funko Goku', 70, 110);
        $this->b = $this->makeProduct('Funko Vegeta', 60, 100);
        $this->bundle = $this->createBundle([
            ['product_id' => $this->a->id, 'quantity' => 2],
            ['product_id' => $this->b->id, 'quantity' => 1],
        ]);
    }

    public function test_suma_cero_con_fila_negativa_sigue_bloqueando_borrar_y_editar(): void
    {
        $this->stock($this->a, $this->exhA, 10);
        $this->stock($this->b, $this->exhA, 10);
        $this->assemble($this->bundle, $this->storeA, 2)->assertOk();
        // Ajuste viejo en la otra tienda: la SUMA total queda en 0.
        $this->stock($this->bundle, $this->exhB, -2);

        $this->actingAs($this->admin)->deleteJson("/api/v1/bundles/{$this->bundle->id}")
            ->assertStatus(422)
            ->assertJsonFragment(['error' => 'No se puede eliminar: hay 2 paquete(s) armados. Desármalos primero.']);
        $this->actingAs($this->admin)->deleteJson("/api/v1/products/{$this->bundle->id}")
            ->assertStatus(422)
            ->assertJsonFragment(['error' => 'No se puede eliminar: el paquete tiene inventario (armados o un ajuste negativo). Desármalo o corrígelo desde Paquetes.']);
        $this->actingAs($this->admin)->deleteJson("/api/v1/products/{$this->bundle->id}/force")->assertStatus(422);
        $this->actingAs($this->admin)->putJson("/api/v1/bundles/{$this->bundle->id}", [
            'components' => [['product_id' => $this->a->id, 'quantity' => 1], ['product_id' => $this->b->id, 'quantity' => 1]],
        ])->assertStatus(422)
            ->assertJsonFragment(['error' => 'No puedes cambiar los componentes mientras haya paquetes armados (stock: 2). Desarma primero.']);

        $this->actingAs($this->admin)->getJson("/api/v1/bundles/{$this->bundle->id}")
            ->assertOk()
            ->assertJsonPath('data.stock_total', 0)
            ->assertJsonPath('data.composition_locked', true);
        $list = $this->actingAs($this->admin)->getJson('/api/v1/bundles')->assertOk();
        $this->assertTrue((bool) collect($list->json('data.data'))->firstWhere('id', $this->bundle->id)['composition_locked']);

        $this->assertDatabaseHas('products', ['id' => $this->bundle->id]);
        $this->assertSame(2, ProductBundleItem::where('bundle_product_id', $this->bundle->id)->count());
    }

    public function test_solo_fila_negativa_bloquea_con_mensaje_propio_y_se_libera_al_corregir(): void
    {
        $this->stock($this->bundle, $this->exhB, -1);

        $this->actingAs($this->admin)->deleteJson("/api/v1/bundles/{$this->bundle->id}")
            ->assertStatus(422)
            ->assertJsonFragment(['error' => 'No se puede eliminar: el paquete tiene inventario negativo (-1) en alguna tienda. Corrige ese ajuste primero.']);
        $this->actingAs($this->admin)->putJson("/api/v1/bundles/{$this->bundle->id}", [
            'components' => [['product_id' => $this->a->id, 'quantity' => 1], ['product_id' => $this->b->id, 'quantity' => 1]],
        ])->assertStatus(422)
            ->assertJsonFragment(['error' => 'No puedes cambiar los componentes: el paquete tiene inventario negativo (-1) en alguna tienda. Corrige ese ajuste primero.']);

        $this->stock($this->bundle, $this->exhB, 0);
        $this->actingAs($this->admin)->deleteJson("/api/v1/bundles/{$this->bundle->id}")->assertOk();
        $this->assertDatabaseMissing('products', ['id' => $this->bundle->id]);
    }

    public function test_stock_negativo_de_un_componente_cuenta_como_cero_al_calcular_y_al_armar(): void
    {
        // A: −4 en Exhibición (ajuste viejo) + 10 en Bodega; B: 3 + 2. Paquete = 2A + 1B.
        // Sumando en bruto A daría floor(6/2) = 3; tratando el negativo como 0 → 5 (igual que assemble).
        $this->stock($this->a, $this->exhA, -4);
        $this->stock($this->a, $this->bodA, 10);
        $this->stock($this->b, $this->exhA, 3);
        $this->stock($this->b, $this->bodA, 2);

        $res = $this->actingAs($this->admin)->getJson("/api/v1/bundles/{$this->bundle->id}?store_id={$this->storeA->id}")->assertOk();
        $av = collect($res->json('data.availability'))->firstWhere('store_id', $this->storeA->id);
        $this->assertSame(5, $av['max_buildable']);
        $compA = collect($av['components'])->firstWhere('product_id', $this->a->id);
        $this->assertSame(0.0, (float) $compA['stock_exhibicion'], 'el negativo se reporta como 0: la UI suma estos campos');
        $this->assertSame(10.0, (float) $compA['stock_bodega']);
        $this->assertSame(0, $compA['max_from_exhibicion']);
        $this->assertSame(5, $compA['max_from_combined']);

        // Lo que dice la disponibilidad es exactamente lo que el armado acepta.
        $this->assemble($this->bundle, $this->storeA, 6)->assertStatus(422);
        $this->assemble($this->bundle, $this->storeA, 5)->assertOk();
        $this->assertSame(-4.0, $this->qty($this->a, $this->exhA), 'la fila negativa no se toca');
        $this->assertSame(0.0, $this->qty($this->a, $this->bodA));
        $this->assertSame(5.0, $this->qty($this->bundle, $this->exhA));
    }
}
