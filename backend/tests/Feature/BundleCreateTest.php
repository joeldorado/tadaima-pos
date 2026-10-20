<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Product;
use App\Models\ProductBundleItem;
use App\Models\SystemLog;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Concerns\BuildsBundleWorld;
use Tests\TestCase;

/** Paquetes (2026-10-07): alta, códigos, costo, edición y borrado. */
class BundleCreateTest extends TestCase
{
    use BuildsBundleWorld;
    use RefreshDatabase;

    private Product $a;

    private Product $b;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buildBundleWorld();
        $this->a = $this->makeProduct('Funko Goku', 70, 110);
        $this->b = $this->makeProduct('Funko Vegeta', 60, 100);
    }

    public function test_crea_paquete_con_sku_y_barcode_generados(): void
    {
        $res = $this->actingAs($this->admin)->postJson('/api/v1/bundles', $this->bundlePayload([
            ['product_id' => $this->a->id, 'quantity' => 2],
            ['product_id' => $this->b->id, 'quantity' => 1],
        ], 300, ['description' => '  Dúo Saiyajin  ']));

        $res->assertStatus(201)
            ->assertJsonPath('data.product_type', 'bundle')
            ->assertJsonPath('data.sku', 'PAQ-0001')
            ->assertJsonPath('data.components_count', 2)
            ->assertJsonPath('data.description', 'Dúo Saiyajin')
            ->assertJsonPath('data.catalog_visible', false)
            ->assertJsonPath('data.composition_locked', false)
            ->assertJsonPath('data.prices.price_1', 300)
            ->assertJsonPath('data.suggested_price_sum', 320)
            ->assertJsonPath('data.cost', 200); // 2×70 + 60

        $barcode = (string) $res->json('data.barcode');
        $this->assertTrue(self::ean13IsValid($barcode), "barcode inválido: {$barcode}");
        $this->assertStringStartsWith('200', $barcode);

        $bundle = Product::findOrFail((int) $res->json('data.id'));
        $this->assertSame('bundle', $bundle->product_type);
        $this->assertFalse((bool) $bundle->catalog_visible);
        $this->assertEqualsWithDelta(200.0, (float) $bundle->cost, 0.001);
        $this->assertSame(
            [[$this->a->id, 2, 0], [$this->b->id, 1, 1]],
            ProductBundleItem::where('bundle_product_id', $bundle->id)->orderBy('position')
                ->get()->map(fn ($i) => [$i->component_product_id, $i->quantity, $i->position])->all()
        );
        $this->assertTrue(SystemLog::where('action', 'bundle.created')->where('entity_id', $bundle->id)->exists());
        // Availability viene para todas las tiendas (admin sin store_id).
        $this->assertCount(2, $res->json('data.availability'));
    }

    public function test_sku_secuencial_y_sku_del_cliente(): void
    {
        $this->createBundle([['product_id' => $this->a->id, 'quantity' => 1], ['product_id' => $this->b->id, 'quantity' => 1]]);
        $second = $this->createBundle([['product_id' => $this->a->id, 'quantity' => 1], ['product_id' => $this->b->id, 'quantity' => 2]]);
        $this->assertSame('PAQ-0002', $second->sku);

        $res = $this->actingAs($this->admin)->postJson('/api/v1/bundles', $this->bundlePayload([
            ['product_id' => $this->a->id, 'quantity' => 1], ['product_id' => $this->b->id, 'quantity' => 1],
        ], 300, ['sku' => 'combo-goku', 'barcode' => '2001234567893']));
        $res->assertStatus(201)->assertJsonPath('data.sku', 'combo-goku')->assertJsonPath('data.barcode', '2001234567893');

        // Duplicado → 422 en español.
        $this->actingAs($this->admin)->postJson('/api/v1/bundles', $this->bundlePayload([
            ['product_id' => $this->a->id, 'quantity' => 1], ['product_id' => $this->b->id, 'quantity' => 1],
        ], 300, ['sku' => 'combo-goku']))
            ->assertStatus(422)
            ->assertJsonPath('errors.sku.0', 'Ese SKU / código ya lo tiene otro producto.');
    }

    public function test_costo_null_si_un_componente_no_tiene_costo(): void
    {
        $sinCosto = $this->makeProduct('Sin costo', null, 50);
        $bundle = $this->createBundle([['product_id' => $this->a->id, 'quantity' => 1], ['product_id' => $sinCosto->id, 'quantity' => 1]]);
        $this->assertNull($bundle->cost);
    }

    public function test_validaciones_de_composicion(): void
    {
        $payload = fn (array $c) => $this->bundlePayload($c);

        $this->actingAs($this->admin)->postJson('/api/v1/bundles', $payload([['product_id' => $this->a->id, 'quantity' => 1]]))
            ->assertStatus(422)->assertJsonPath('errors.components.0', 'Un paquete necesita al menos 2 productos distintos.');

        $this->actingAs($this->admin)->postJson('/api/v1/bundles', $payload([
            ['product_id' => $this->a->id, 'quantity' => 1], ['product_id' => $this->a->id, 'quantity' => 1],
        ]))->assertStatus(422)->assertJsonFragment(['Hay productos repetidos; súmalos en una sola línea.']);

        $this->actingAs($this->admin)->postJson('/api/v1/bundles', $payload([
            ['product_id' => $this->a->id, 'quantity' => 0], ['product_id' => $this->b->id, 'quantity' => 1],
        ]))->assertStatus(422)->assertJsonFragment(['Cada producto necesita cantidad de 1 o más.']);

        $other = $this->createBundle([['product_id' => $this->a->id, 'quantity' => 1], ['product_id' => $this->b->id, 'quantity' => 1]]);
        $this->actingAs($this->admin)->postJson('/api/v1/bundles', $payload([
            ['product_id' => $other->id, 'quantity' => 1], ['product_id' => $this->b->id, 'quantity' => 1],
        ]))->assertStatus(422)->assertJsonFragment(['«Paquete Test» es un paquete; un paquete no puede contener otro paquete.']);

        $this->a->update(['active' => false]);
        $this->actingAs($this->admin)->postJson('/api/v1/bundles', $payload([
            ['product_id' => $this->a->id, 'quantity' => 1], ['product_id' => $this->b->id, 'quantity' => 1],
        ]))->assertStatus(422)->assertJsonFragment(['«Funko Goku» está inactivo y no puede ir en un paquete.']);

        $this->actingAs($this->admin)->postJson('/api/v1/bundles', [
            'name' => 'Sin precio',
            'components' => [['product_id' => $this->b->id, 'quantity' => 1], ['product_id' => $this->a->id, 'quantity' => 1]],
        ])->assertStatus(422)->assertJsonPath('errors.prices.0', 'Escribe el precio normal del paquete.');
    }

    public function test_update_datos_siempre_y_componentes_solo_sin_stock(): void
    {
        $bundle = $this->createBundle([['product_id' => $this->a->id, 'quantity' => 2], ['product_id' => $this->b->id, 'quantity' => 1]]);
        $this->stock($this->a, $this->exhA, 10);
        $this->stock($this->b, $this->exhA, 10);
        $this->assemble($bundle, $this->storeA, 1)->assertOk();

        // Nombre y precios se editan aunque haya armados.
        $this->actingAs($this->gerenteA)->putJson("/api/v1/bundles/{$bundle->id}", [
            'name' => 'Dúo Saiyajin', 'prices' => ['price_1' => 280, 'price_2' => 250],
        ])->assertOk()->assertJsonPath('data.name', 'Dúo Saiyajin')->assertJsonPath('data.prices.price_2', 250)
            ->assertJsonPath('data.composition_locked', true);

        // Componentes bloqueados con stock.
        $this->actingAs($this->admin)->putJson("/api/v1/bundles/{$bundle->id}", [
            'components' => [['product_id' => $this->a->id, 'quantity' => 1], ['product_id' => $this->b->id, 'quantity' => 1]],
        ])->assertStatus(422)->assertJsonFragment(['error' => 'No puedes cambiar los componentes mientras haya paquetes armados (stock: 1). Desarma primero.']);

        $this->disassemble($bundle, $this->storeA, 1)->assertOk();
        $this->actingAs($this->admin)->putJson("/api/v1/bundles/{$bundle->id}", [
            'components' => [['product_id' => $this->a->id, 'quantity' => 1], ['product_id' => $this->b->id, 'quantity' => 3]],
        ])->assertOk()->assertJsonPath('data.components.1.quantity', 3)->assertJsonPath('data.cost', 250); // 70 + 3×60
    }

    public function test_delete_bloqueado_con_stock_y_ok_sin_stock(): void
    {
        $bundle = $this->createBundle([['product_id' => $this->a->id, 'quantity' => 1], ['product_id' => $this->b->id, 'quantity' => 1]]);
        $this->stock($this->a, $this->exhA, 5);
        $this->stock($this->b, $this->exhA, 5);
        $this->assemble($bundle, $this->storeA, 2)->assertOk();

        $this->actingAs($this->admin)->deleteJson("/api/v1/bundles/{$bundle->id}")
            ->assertStatus(422)->assertJsonFragment(['error' => 'No se puede eliminar: hay 2 paquete(s) armados. Desármalos primero.']);

        $this->disassemble($bundle, $this->storeA, 2)->assertOk();
        $this->actingAs($this->admin)->deleteJson("/api/v1/bundles/{$bundle->id}")->assertOk();
        $this->assertDatabaseMissing('products', ['id' => $bundle->id]);
        $this->assertSame(0, ProductBundleItem::where('bundle_product_id', $bundle->id)->count());
        // Las piezas regresaron antes de borrar.
        $this->assertSame(5.0, $this->qty($this->a, $this->exhA));
    }

    public function test_un_componente_no_se_puede_eliminar(): void
    {
        $this->createBundle([['product_id' => $this->a->id, 'quantity' => 1], ['product_id' => $this->b->id, 'quantity' => 1]]);

        $this->actingAs($this->admin)->deleteJson("/api/v1/products/{$this->a->id}")
            ->assertStatus(422)->assertJsonFragment(['error' => 'No se puede eliminar: es componente del paquete «Paquete Test» (PAQ-0001). Quítalo del paquete (o elimina el paquete) primero.']);
        $this->actingAs($this->admin)->deleteJson("/api/v1/products/{$this->a->id}/force")->assertStatus(422);
        $this->assertDatabaseHas('products', ['id' => $this->a->id]);
    }

    public function test_products_no_crea_ni_retipa_paquetes(): void
    {
        $this->actingAs($this->admin)->postJson('/api/v1/products', [
            'name' => 'Falso', 'sku' => 'FALSO-1', 'product_type' => 'bundle', 'prices' => ['price_1' => 10],
        ])->assertStatus(422);

        $bundle = $this->createBundle([['product_id' => $this->a->id, 'quantity' => 1], ['product_id' => $this->b->id, 'quantity' => 1]]);
        $this->actingAs($this->admin)->putJson("/api/v1/products/{$bundle->id}", ['product_type' => 'product'])
            ->assertStatus(422)->assertJsonPath('errors.product_type.0', 'El tipo de un paquete no se puede cambiar.');
        $this->assertSame('bundle', $bundle->fresh()->product_type);
    }
}
