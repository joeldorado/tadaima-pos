<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\InventoryMovement;
use App\Models\Product;
use App\Models\SaleItem;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Concerns\BuildsBundleWorld;
use Tests\TestCase;

/**
 * Paquetes (2026-10-07): vender un paquete en Caja descuenta SOLO el stock del
 * paquete (los componentes ya se descontaron al armar) y cancelar lo regresa.
 */
class BundleCheckoutTest extends TestCase
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
            ['product_id' => $this->a->id, 'quantity' => 1],
            ['product_id' => $this->b->id, 'quantity' => 1],
        ], 180);
        $this->stock($this->a, $this->exhA, 10);
        $this->stock($this->b, $this->exhA, 10);
        $this->assemble($this->bundle, $this->storeA, 3)->assertOk(); // A 7, B 7, paquete 3
    }

    private function checkout(array $items, float $amount): \Illuminate\Testing\TestResponse
    {
        $session = $this->openSession($this->cajeroA, $this->storeA);

        return $this->actingAs($this->cajeroA)->postJson('/api/v1/sales', [
            'store_id' => $this->storeA->id,
            'register_session_id' => $session->id,
            'calc_version' => 2,
            'items' => $items,
            'payments' => [['payment_method_id' => $this->cashMethod()->id, 'amount' => $amount]],
        ]);
    }

    public function test_vender_paquete_descuenta_solo_el_paquete(): void
    {
        $res = $this->checkout([['product_id' => $this->bundle->id, 'quantity' => 1, 'price' => 180]], 180);
        $res->assertStatus(201);

        $this->assertSame(2.0, $this->qty($this->bundle, $this->exhA));
        $this->assertSame(7.0, $this->qty($this->a, $this->exhA));
        $this->assertSame(7.0, $this->qty($this->b, $this->exhA));

        $item = SaleItem::first();
        $this->assertSame($this->bundle->id, $item->product_id);
        $this->assertSame('Paquete Test', $item->product_name);
        $this->assertSame('PAQ-0001', $item->product_sku);
        $this->assertEqualsWithDelta(130.0, (float) $item->cost, 0.001); // 70 + 60 snapshot

        $venta = InventoryMovement::where('type', 'venta')->get();
        $this->assertCount(1, $venta);
        $this->assertSame($this->bundle->id, $venta->first()->product_id);
    }

    public function test_cancelar_regresa_el_paquete_no_los_componentes(): void
    {
        $res = $this->checkout([['product_id' => $this->bundle->id, 'quantity' => 2, 'price' => 180]], 360);
        $res->assertStatus(201);
        $saleId = (int) $res->json('data.id');
        $this->assertSame(1.0, $this->qty($this->bundle, $this->exhA));

        $this->actingAs($this->cajeroA)->postJson("/api/v1/sales/{$saleId}/cancel", ['reason_code' => 'otro', 'reason' => 'prueba'])
            ->assertOk();

        $this->assertSame(3.0, $this->qty($this->bundle, $this->exhA));
        $this->assertSame(7.0, $this->qty($this->a, $this->exhA));
        $this->assertSame(7.0, $this->qty($this->b, $this->exhA));
    }

    public function test_precio_fuera_de_catalogo_y_stock_insuficiente(): void
    {
        $this->checkout([['product_id' => $this->bundle->id, 'quantity' => 1, 'price' => 150]], 150)->assertStatus(422);

        $res = $this->checkout([['product_id' => $this->bundle->id, 'quantity' => 4, 'price' => 180]], 720);
        $res->assertStatus(422);
        $this->assertStringContainsString('Stock insuficiente en Exhibición', (string) $res->json('error'));
        $this->assertSame(3.0, $this->qty($this->bundle, $this->exhA));
    }
}
