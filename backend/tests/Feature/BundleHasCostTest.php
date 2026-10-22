<?php

declare(strict_types=1);

namespace Tests\Feature;

use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Concerns\BuildsBundleWorld;
use Tests\TestCase;

/**
 * `has_cost` (Ruben 2026-10-22): el asistente de paquetes avisa cuando un
 * componente no tiene costo capturado. Lo ven todos los roles porque solo dice
 * sí/no (como el filtro `?no_cost=1` de /products); el MONTO sigue gateado por
 * canViewCost (ADR-015).
 */
class BundleHasCostTest extends TestCase
{
    use BuildsBundleWorld;
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buildBundleWorld();
    }

    public function test_products_light_dice_si_tiene_costo_sin_mandar_el_monto(): void
    {
        $conCosto = $this->makeProduct('Con costo', 40);
        $sinCosto = $this->makeProduct('Sin costo', null);
        $costoCero = $this->makeProduct('Costo cero', 0);

        $rows = collect($this->actingAs($this->cajeroA)
            ->getJson('/api/v1/products?light=1&per_page=50')
            ->assertOk()
            ->json('data'))
            ->keyBy('id');

        $this->assertTrue($rows[$conCosto->id]['has_cost']);
        $this->assertFalse($rows[$sinCosto->id]['has_cost']);
        $this->assertFalse($rows[$costoCero->id]['has_cost']);
        $this->assertArrayNotHasKey('cost', $rows[$conCosto->id]);
    }

    public function test_componentes_del_paquete_traen_has_cost_y_el_costo_solo_con_permiso(): void
    {
        $conCosto = $this->makeProduct('Con costo', 40);
        $sinCosto = $this->makeProduct('Sin costo', null);
        $bundle = $this->createBundle([
            ['product_id' => $conCosto->id, 'quantity' => 1],
            ['product_id' => $sinCosto->id, 'quantity' => 1],
        ]);

        $cajero = collect($this->actingAs($this->cajeroA)
            ->getJson("/api/v1/bundles/{$bundle->id}")
            ->assertOk()
            ->json('data.components'))
            ->keyBy('product_id');

        $this->assertTrue($cajero[$conCosto->id]['has_cost']);
        $this->assertFalse($cajero[$sinCosto->id]['has_cost']);
        $this->assertArrayNotHasKey('cost', $cajero[$conCosto->id]);

        $admin = collect($this->actingAs($this->admin)
            ->getJson("/api/v1/bundles/{$bundle->id}")
            ->assertOk()
            ->json('data.components'))
            ->keyBy('product_id');

        $this->assertSame(40.0, (float) $admin[$conCosto->id]['cost']);
    }
}
