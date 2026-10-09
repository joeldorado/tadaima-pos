<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Product;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Concerns\BuildsBundleWorld;
use Tests\TestCase;

/** Paquetes (2026-10-07): gerente/cajero solo operan y consultan SU tienda. */
class BundleStoreScopeTest extends TestCase
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
        $this->bundle = $this->createBundle([['product_id' => $a->id, 'quantity' => 1], ['product_id' => $b->id, 'quantity' => 1]]);
        foreach ([$this->exhA, $this->exhB] as $wh) {
            $this->stock($a, $wh, 5);
            $this->stock($b, $wh, 5);
        }
    }

    public function test_gerente_y_cajero_arman_solo_en_su_tienda(): void
    {
        foreach ([$this->gerenteA, $this->cajeroA] as $user) {
            $this->assemble($this->bundle, $this->storeB, 1, [], $user)->assertStatus(403);
            $this->assemble($this->bundle, $this->storeA, 1, [], $user)->assertOk();
            $this->disassemble($this->bundle, $this->storeB, 1, [], $user)->assertStatus(403);
            $this->disassemble($this->bundle, $this->storeA, 1, [], $user)->assertOk();
        }
    }

    public function test_lectura_scoped_a_su_tienda(): void
    {
        $this->actingAs($this->gerenteA)->getJson("/api/v1/bundles?store_id={$this->storeB->id}")->assertStatus(403);
        $this->actingAs($this->gerenteA)->getJson("/api/v1/bundles/{$this->bundle->id}?store_id={$this->storeB->id}")->assertStatus(403);

        $list = $this->actingAs($this->gerenteA)->getJson('/api/v1/bundles');
        $list->assertOk()->assertJsonCount(1, 'data.data.0.availability')
            ->assertJsonPath('data.data.0.availability.0.store_id', $this->storeA->id);

        $preview = $this->actingAs($this->cajeroA)->postJson('/api/v1/bundles/preview', [
            'components' => [['product_id' => Product::where('name', 'A')->value('id'), 'quantity' => 1]],
        ]);
        $preview->assertOk()->assertJsonCount(1, 'data.availability')->assertJsonPath('data.availability.0.store_name', 'Macro');

        $this->actingAs($this->cajeroA)->postJson('/api/v1/bundles/preview', [
            'store_id' => $this->storeB->id,
            'components' => [['product_id' => Product::where('name', 'A')->value('id'), 'quantity' => 1]],
        ])->assertStatus(403);
    }

    public function test_usuario_sin_tienda_no_arma_y_ve_disponibilidad_vacia(): void
    {
        $sinTienda = $this->makeUser('sin.tienda@test.com', 'cajero', null);
        $this->assemble($this->bundle, $this->storeA, 1, [], $sinTienda)->assertStatus(403);
        $this->actingAs($sinTienda)->getJson('/api/v1/bundles')->assertOk()->assertJsonCount(0, 'data.data.0.availability');
    }

    public function test_admin_ve_todas_las_tiendas(): void
    {
        $this->actingAs($this->admin)->getJson('/api/v1/bundles')->assertOk()->assertJsonCount(2, 'data.data.0.availability');
        $this->assemble($this->bundle, $this->storeB, 1)->assertOk();
    }

    public function test_cajero_no_edita_paquetes_pero_si_crea_y_arma(): void
    {
        // Editar = política de productos (admin/gerente): precio/activo son globales a todas las tiendas.
        $this->actingAs($this->cajeroA)->putJson("/api/v1/bundles/{$this->bundle->id}", ['name' => 'Otro'])->assertStatus(403);
        $this->actingAs($this->gerenteA)->putJson("/api/v1/bundles/{$this->bundle->id}", ['name' => 'Otro'])->assertOk();
        // catalog_visible además exige el flag de catálogo (gerente sin flag → 403).
        $this->actingAs($this->gerenteA)->putJson("/api/v1/bundles/{$this->bundle->id}", ['catalog_visible' => true])->assertStatus(403);
        $this->actingAs($this->admin)->putJson("/api/v1/bundles/{$this->bundle->id}", ['catalog_visible' => true])->assertOk();

        $a = Product::where('name', 'A')->firstOrFail();
        $b = Product::where('name', 'B')->firstOrFail();
        $this->actingAs($this->cajeroA)->postJson('/api/v1/bundles', $this->bundlePayload([
            ['product_id' => $a->id, 'quantity' => 1], ['product_id' => $b->id, 'quantity' => 1],
        ]))->assertStatus(201);

        // Crear YA visible en la tienda online exige el flag de catálogo (igual que al editar).
        $components = [['product_id' => $a->id, 'quantity' => 2], ['product_id' => $b->id, 'quantity' => 1]];
        $this->actingAs($this->cajeroA)
            ->postJson('/api/v1/bundles', $this->bundlePayload($components, 300, ['catalog_visible' => true]))
            ->assertStatus(403);
        $this->actingAs($this->admin)
            ->postJson('/api/v1/bundles', $this->bundlePayload($components, 300, ['catalog_visible' => true]))
            ->assertStatus(201)
            ->assertJsonPath('data.catalog_visible', true);
    }

    public function test_costo_oculto_sin_permiso(): void
    {
        $this->assemble($this->bundle, $this->storeA, 1)->assertOk();

        $res = $this->actingAs($this->cajeroA)->getJson("/api/v1/bundles/{$this->bundle->id}");
        $res->assertOk()
            ->assertJsonMissingPath('data.cost')
            ->assertJsonMissingPath('data.components.0.cost')
            ->assertJsonMissingPath('data.assemblies.0.components.0.unit_cost');
        // Con `$this->when(false)` dentro de una Collection salía `"cost": {}` — debe NO existir.
        $this->assertArrayNotHasKey('cost', $res->json('data.components.0'));

        $admin = $this->actingAs($this->admin)->getJson("/api/v1/bundles/{$this->bundle->id}");
        $admin->assertOk()->assertJsonPath('data.components.0.cost', 10)->assertJsonPath('data.cost', 20);

        $preview = $this->actingAs($this->cajeroA)->postJson('/api/v1/bundles/preview', [
            'components' => [['product_id' => Product::where('name', 'A')->value('id'), 'quantity' => 1]],
        ]);
        $preview->assertOk()->assertJsonMissingPath('data.components.0.cost')->assertJsonPath('data.cost_sum', null);
    }

    public function test_borrar_requiere_permiso_de_costos(): void
    {
        $this->actingAs($this->cajeroA)->deleteJson("/api/v1/bundles/{$this->bundle->id}")->assertStatus(403);
        $this->actingAs($this->admin)->deleteJson("/api/v1/bundles/{$this->bundle->id}")->assertOk();
    }
}
