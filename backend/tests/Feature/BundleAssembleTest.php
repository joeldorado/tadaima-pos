<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\BundleAssembly;
use App\Models\InventoryMovement;
use App\Models\Product;
use App\Models\Store;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Concerns\BuildsBundleWorld;
use Tests\TestCase;

/**
 * Paquetes (2026-10-07): "puedes armar N" y armar/desarmar con origen
 * Exhibición/Bodega. Escenario base en Macro: A exh 10 / B exh 3 + bod 2,
 * paquete = 2A + 1B → máximo 5 (A limita a 5, B combinado 5).
 */
class BundleAssembleTest extends TestCase
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
        $this->stock($this->a, $this->exhA, 10);
        $this->stock($this->b, $this->exhA, 3);
        $this->stock($this->b, $this->bodA, 2);
    }

    public function test_max_buildable_por_tienda(): void
    {
        $res = $this->actingAs($this->admin)->getJson("/api/v1/bundles/{$this->bundle->id}?store_id={$this->storeA->id}");
        $res->assertOk()
            ->assertJsonCount(1, 'data.availability')
            ->assertJsonPath('data.availability.0.store_name', 'Macro')
            ->assertJsonPath('data.availability.0.has_bodega', true)
            ->assertJsonPath('data.availability.0.max_buildable', 5)
            ->assertJsonPath('data.availability.0.stock_exhibicion', 0)
            ->assertJsonPath('data.availability.0.components.0.product_id', $this->a->id)
            ->assertJsonPath('data.availability.0.components.0.max_from_exhibicion', 5)
            ->assertJsonPath('data.availability.0.components.0.limiting', true)
            ->assertJsonPath('data.availability.0.components.1.stock_exhibicion', 3)
            ->assertJsonPath('data.availability.0.components.1.stock_bodega', 2)
            ->assertJsonPath('data.availability.0.components.1.max_from_exhibicion', 3)
            ->assertJsonPath('data.availability.0.components.1.max_from_combined', 5)
            ->assertJsonPath('data.availability.0.components.1.limiting', true);

        // Admin sin store_id → todas las tiendas (Centro sin stock → 0).
        $all = $this->actingAs($this->admin)->getJson("/api/v1/bundles/{$this->bundle->id}");
        $all->assertOk()->assertJsonCount(2, 'data.availability');
        $centro = collect($all->json('data.availability'))->firstWhere('store_name', 'Centro');
        $this->assertSame(0, $centro['max_buildable']);

        // El listado trae la misma disponibilidad.
        $list = $this->actingAs($this->admin)->getJson("/api/v1/bundles?store_id={$this->storeA->id}");
        $list->assertOk()->assertJsonPath('data.data.0.availability.0.max_buildable', 5)->assertJsonPath('data.pagination.total', 1);
    }

    public function test_preview_antes_de_guardar(): void
    {
        $res = $this->actingAs($this->admin)->postJson('/api/v1/bundles/preview', [
            'store_id' => $this->storeA->id,
            'components' => [['product_id' => $this->a->id, 'quantity' => 2], ['product_id' => $this->b->id, 'quantity' => 1]],
        ]);
        $res->assertOk()
            ->assertJsonPath('data.suggested_price_sum', 320)
            ->assertJsonPath('data.cost_sum', 200)
            ->assertJsonPath('data.availability.0.max_buildable', 5)
            ->assertJsonPath('data.components.0.name', 'Funko Goku');
    }

    public function test_armar_auto_divide_exhibicion_y_bodega(): void
    {
        $res = $this->assemble($this->bundle, $this->storeA, 5, ['notes' => 'Para la vitrina']);
        $res->assertOk()
            ->assertJsonPath('message', 'Se armaron 5 paquete(s) en Macro.')
            ->assertJsonPath('data.assembly.type', 'armado')
            ->assertJsonPath('data.assembly.quantity', 5)
            ->assertJsonPath('data.assembly.notes', 'Para la vitrina')
            ->assertJsonPath('data.bundle.availability.0.max_buildable', 0)
            ->assertJsonPath('data.bundle.availability.0.stock_exhibicion', 5)
            ->assertJsonPath('data.bundle.stock_total', 5)
            ->assertJsonPath('data.bundle.composition_locked', true);

        $this->assertSame(0.0, $this->qty($this->a, $this->exhA));
        $this->assertSame(0.0, $this->qty($this->b, $this->exhA));
        $this->assertSame(0.0, $this->qty($this->b, $this->bodA));
        $this->assertSame(5.0, $this->qty($this->bundle, $this->exhA));

        $moves = InventoryMovement::where('reference', "PAQ-{$this->bundle->id}")->orderBy('id')->get();
        $this->assertCount(4, $moves);
        $this->assertTrue($moves->every(fn ($m) => $m->type === 'transferencia'));
        $byKey = $moves->mapWithKeys(fn ($m) => ["{$m->product_id}@{$m->warehouse_id}" => (float) $m->quantity]);
        $this->assertSame(-10.0, $byKey["{$this->a->id}@{$this->exhA->id}"]);
        $this->assertSame(-3.0, $byKey["{$this->b->id}@{$this->exhA->id}"]);
        $this->assertSame(-2.0, $byKey["{$this->b->id}@{$this->bodA->id}"]);
        $this->assertSame(5.0, $byKey["{$this->bundle->id}@{$this->exhA->id}"]);

        $assembly = BundleAssembly::first();
        $snapB = collect($assembly->components_snapshot)->firstWhere('product_id', $this->b->id);
        $this->assertSame(3.0, (float) $snapB['from_store_qty']);
        $this->assertSame(2.0, (float) $snapB['from_bodega_qty']);
        $this->assertSame(5, $snapB['total_qty']);
        $this->assertSame($this->exhA->id, $assembly->warehouse_id);
    }

    public function test_armar_forzando_bodega_insuficiente_422_con_rollback(): void
    {
        $res = $this->assemble($this->bundle, $this->storeA, 3, [
            'sources' => [['product_id' => $this->b->id, 'source' => 'bodega']],
        ]);
        $res->assertStatus(422);
        $this->assertStringContainsString('Bodega de Macro', (string) $res->json('error'));
        $this->assertStringContainsString('Funko Vegeta', (string) $res->json('error'));

        // Nada se movió (A iba primero por id y ya se había descontado dentro de la transacción).
        $this->assertSame(10.0, $this->qty($this->a, $this->exhA));
        $this->assertSame(0.0, $this->qty($this->bundle, $this->exhA));
        $this->assertSame(0, BundleAssembly::count());
        $this->assertSame(0, InventoryMovement::count());
    }

    public function test_armar_forzando_exhibicion(): void
    {
        $this->assemble($this->bundle, $this->storeA, 3, [
            'sources' => [['product_id' => $this->b->id, 'source' => 'store']],
        ])->assertOk();
        $this->assertSame(0.0, $this->qty($this->b, $this->exhA));
        $this->assertSame(2.0, $this->qty($this->b, $this->bodA));
        $this->assertSame(4.0, $this->qty($this->a, $this->exhA));
    }

    public function test_armar_de_mas_422_con_maximo(): void
    {
        $res = $this->assemble($this->bundle, $this->storeA, 6);
        $res->assertStatus(422);
        $this->assertStringContainsString('Puedes armar máximo 5 paquete(s)', (string) $res->json('error'));
        $this->assertStringContainsString('Funko Goku', (string) $res->json('error'));
    }

    public function test_tienda_sin_bodega(): void
    {
        $this->bodB->update(['active' => false]);
        $this->stock($this->a, $this->exhB, 4);
        $this->stock($this->b, $this->exhB, 4);

        $this->actingAs($this->admin)->getJson("/api/v1/bundles/{$this->bundle->id}?store_id={$this->storeB->id}")
            ->assertOk()
            ->assertJsonPath('data.availability.0.has_bodega', false)
            ->assertJsonPath('data.availability.0.max_buildable', 2);

        $this->assemble($this->bundle, $this->storeB, 1, [
            'sources' => [['product_id' => $this->a->id, 'source' => 'bodega']],
        ])->assertStatus(422)->assertJsonFragment(['error' => 'La tienda Centro no tiene Bodega.']);

        $this->assemble($this->bundle, $this->storeB, 2)->assertOk();
        $this->assertSame(2.0, $this->qty($this->bundle, $this->exhB));
    }

    public function test_desarmar_regresa_a_exhibicion_por_default(): void
    {
        $this->assemble($this->bundle, $this->storeA, 2)->assertOk();
        $res = $this->disassemble($this->bundle, $this->storeA, 2);
        $res->assertOk()
            ->assertJsonPath('message', 'Se desarmaron 2 paquete(s) en Macro.')
            ->assertJsonPath('data.assembly.type', 'desarmado')
            ->assertJsonPath('data.bundle.stock_total', 0);

        $this->assertSame(0.0, $this->qty($this->bundle, $this->exhA));
        $this->assertSame(10.0, $this->qty($this->a, $this->exhA));
        $this->assertSame(3.0, $this->qty($this->b, $this->exhA));
        $this->assertSame(2.0, $this->qty($this->b, $this->bodA));
        $this->assertSame(BundleAssembly::TYPE_DESARMADO, BundleAssembly::orderByDesc('id')->first()->type);
    }

    public function test_desarmar_a_bodega(): void
    {
        $this->assemble($this->bundle, $this->storeA, 2)->assertOk(); // A exh 6, B exh 1, bod 2
        $this->disassemble($this->bundle, $this->storeA, 2, ['destination' => 'bodega'])->assertOk();

        $this->assertSame(6.0, $this->qty($this->a, $this->exhA));
        $this->assertSame(4.0, $this->qty($this->a, $this->bodA));
        $this->assertSame(1.0, $this->qty($this->b, $this->exhA));
        $this->assertSame(4.0, $this->qty($this->b, $this->bodA));
        $this->assertSame($this->bodA->id, BundleAssembly::orderByDesc('id')->first()->warehouse_id);
        $snap = collect(BundleAssembly::orderByDesc('id')->first()->components_snapshot)->firstWhere('product_id', $this->a->id);
        $this->assertSame('bodega', $snap['to_warehouse']);
    }

    public function test_desarmar_mas_de_lo_armado_422(): void
    {
        $this->assemble($this->bundle, $this->storeA, 1)->assertOk();
        $this->disassemble($this->bundle, $this->storeA, 2)
            ->assertStatus(422)
            ->assertJsonFragment(['error' => 'Solo hay 1 paquete(s) «Paquete Test» armados en Exhibición de Macro; no puedes desarmar 2.']);
        $this->assertSame(1.0, $this->qty($this->bundle, $this->exhA));
    }

    public function test_costo_se_refresca_al_armar(): void
    {
        $this->a->update(['cost' => 100]);
        $this->assertEqualsWithDelta(200.0, (float) $this->bundle->fresh()->cost, 0.001);
        $this->assemble($this->bundle, $this->storeA, 1)->assertOk();
        $this->assertEqualsWithDelta(260.0, (float) $this->bundle->fresh()->cost, 0.001); // 2×100 + 60
    }

    public function test_fuente_de_producto_ajeno_422(): void
    {
        $other = $this->makeProduct('Otro', 10, 10);
        $this->assemble($this->bundle, $this->storeA, 1, [
            'sources' => [['product_id' => $other->id, 'source' => 'store']],
        ])->assertStatus(422)->assertJsonFragment(['error' => "El producto #{$other->id} no es componente de este paquete."]);
    }

    public function test_historial_assemblies(): void
    {
        $this->assemble($this->bundle, $this->storeA, 2)->assertOk();
        $this->disassemble($this->bundle, $this->storeA, 1)->assertOk();

        $res = $this->actingAs($this->admin)->getJson("/api/v1/bundles/{$this->bundle->id}/assemblies");
        $res->assertOk()
            ->assertJsonPath('data.pagination.total', 2)
            ->assertJsonPath('data.data.0.type', 'desarmado')
            ->assertJsonPath('data.data.1.type', 'armado')
            ->assertJsonPath('data.data.1.store.name', 'Macro')
            ->assertJsonPath('data.data.1.user.name', 'admin@test.com');

        // El detalle también los trae.
        $this->actingAs($this->admin)->getJson("/api/v1/bundles/{$this->bundle->id}")
            ->assertOk()->assertJsonCount(2, 'data.assemblies');
    }

    public function test_inventory_move_rechaza_paquetes(): void
    {
        $this->assemble($this->bundle, $this->storeA, 1)->assertOk();
        $this->actingAs($this->admin)->postJson('/api/v1/inventory/move', [
            'product_id' => $this->bundle->id, 'from_warehouse_id' => $this->exhA->id,
            'to_warehouse_id' => $this->bodA->id, 'quantity' => 1,
        ])->assertStatus(422);
        $this->assertSame(1.0, $this->qty($this->bundle, $this->exhA));
    }

    public function test_preview_con_bundle_id_que_no_es_paquete_422(): void
    {
        $this->actingAs($this->admin)->postJson('/api/v1/bundles/preview', [
            'bundle_id' => $this->a->id,
            'components' => [['product_id' => $this->b->id, 'quantity' => 1]],
        ])->assertStatus(422)->assertJsonFragment(['El producto indicado no es un paquete.']);
    }

    public function test_inventory_update_rechaza_paquetes(): void
    {
        $this->actingAs($this->admin)->putJson("/api/v1/inventory/{$this->bundle->id}/{$this->exhA->id}", ['quantity' => 9])
            ->assertStatus(422)
            ->assertJsonFragment(['error' => 'El stock de un paquete se cambia armando o desarmando desde Paquetes.']);
        $this->assertSame(0.0, $this->qty($this->bundle, $this->exhA));

        $this->actingAs($this->admin)->postJson('/api/v1/inventory/movements', [
            'product_id' => $this->bundle->id, 'warehouse_id' => $this->exhA->id, 'type' => 'entrada', 'quantity' => 3,
        ])->assertStatus(422);
    }
}
