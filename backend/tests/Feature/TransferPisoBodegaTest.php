<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\InventoryMovement;
use App\Models\Product;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Concerns\BuildsBundleWorld;
use Tests\TestCase;

/**
 * Traslados (2026-10-26, Ruben): al recibir, el origen es la TIENDA: se descuenta
 * del piso (Exhibición) primero y lo que falte de Bodega, con un movimiento por almacén.
 */
class TransferPisoBodegaTest extends TestCase
{
    use BuildsBundleWorld;
    use RefreshDatabase;

    private Product $p;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buildBundleWorld();
        $this->p = $this->makeProduct('Funko Goku', 70, 110);
    }

    private function trasladar(int $qty): \Illuminate\Testing\TestResponse
    {
        $id = $this->actingAs($this->admin)->postJson('/api/v1/transfers', [
            'from_warehouse_id' => $this->exhA->id,
            'to_warehouse_id' => $this->exhB->id,
            'items' => [['product_id' => $this->p->id, 'quantity' => $qty]],
        ])->assertSuccessful()->json('data.id');

        return $this->actingAs($this->admin)->putJson("/api/v1/transfers/{$id}/complete");
    }

    public function test_alcanza_en_piso_no_toca_bodega(): void
    {
        $this->stock($this->p, $this->exhA, 5);
        $this->stock($this->p, $this->bodA, 5);
        $this->trasladar(3)->assertOk();

        $this->assertSame(2.0, $this->qty($this->p, $this->exhA));
        $this->assertSame(5.0, $this->qty($this->p, $this->bodA));
        $this->assertSame(3.0, $this->qty($this->p, $this->exhB));
    }

    public function test_piso_primero_y_lo_que_falta_de_bodega(): void
    {
        $this->stock($this->p, $this->exhA, 2);
        $this->stock($this->p, $this->bodA, 5);
        $this->trasladar(4)->assertOk();

        $this->assertSame(0.0, $this->qty($this->p, $this->exhA));
        $this->assertSame(3.0, $this->qty($this->p, $this->bodA));
        $this->assertSame(4.0, $this->qty($this->p, $this->exhB));
        $this->assertSame(2, InventoryMovement::where('quantity', '<', 0)->where('type', 'transferencia')->count());
    }

    public function test_piso_negativo_cuenta_como_cero(): void
    {
        $this->stock($this->p, $this->exhA, -2);
        $this->stock($this->p, $this->bodA, 5);
        $this->trasladar(3)->assertOk();

        $this->assertSame(-2.0, $this->qty($this->p, $this->exhA));
        $this->assertSame(2.0, $this->qty($this->p, $this->bodA));
        $this->assertSame(3.0, $this->qty($this->p, $this->exhB));
    }

    public function test_insuficiente_no_mueve_nada(): void
    {
        $this->stock($this->p, $this->exhA, 1);
        $this->stock($this->p, $this->bodA, 1);
        $this->trasladar(3)->assertStatus(422);

        $this->assertSame(1.0, $this->qty($this->p, $this->exhA));
        $this->assertSame(1.0, $this->qty($this->p, $this->bodA));
    }
}
