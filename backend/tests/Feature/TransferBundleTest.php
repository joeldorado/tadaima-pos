<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Product;
use App\Models\Transfer;
use App\Models\TransferItem;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\Feature\Concerns\BuildsBundleWorld;
use Tests\TestCase;

/**
 * Paquetes (2026-10-08): NO se trasladan entre tiendas. Su stock solo cambia
 * armando/desarmando y vive en Exhibición; un traslado lo dejaría atorado en
 * Bodega o en otra tienda. `POST /transfers` y `complete` responden 422 con
 * un mensaje claro: desármalo aquí y ármalo en la otra tienda.
 */
class TransferBundleTest extends TestCase
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
        ]);
        $this->stock($this->a, $this->exhA, 5);
        $this->stock($this->b, $this->exhA, 5);
        $this->assemble($this->bundle, $this->storeA, 3)->assertOk();
    }

    private function payload(array $items): array
    {
        return [
            'from_warehouse_id' => $this->exhA->id,
            'to_warehouse_id' => $this->exhB->id,
            'items' => $items,
        ];
    }

    public function test_crear_traslado_con_paquete_422_y_no_crea_nada(): void
    {
        $this->actingAs($this->admin)
            ->postJson('/api/v1/transfers', $this->payload([['product_id' => $this->bundle->id, 'quantity' => 1]]))
            ->assertStatus(422)
            ->assertJsonFragment(['error' => 'Los paquetes no se trasladan («Paquete Test» PAQ-0001): desármalo aquí y ármalo en la otra tienda.']);

        $this->assertSame(0, Transfer::count());
        $this->assertSame(3.0, $this->qty($this->bundle, $this->exhA));
    }

    public function test_traslado_mixto_con_paquete_tampoco_se_crea(): void
    {
        $this->actingAs($this->gerenteA)
            ->postJson('/api/v1/transfers', $this->payload([
                ['product_id' => $this->a->id, 'quantity' => 1],
                ['product_id' => $this->bundle->id, 'quantity' => 1],
            ]))
            ->assertStatus(422)
            ->assertJsonFragment(['error' => 'Los paquetes no se trasladan («Paquete Test» PAQ-0001): desármalo aquí y ármalo en la otra tienda.']);

        $this->assertSame(0, Transfer::count());
        $this->assertSame(0, TransferItem::count());
    }

    public function test_traslado_pendiente_viejo_con_paquete_no_se_recibe(): void
    {
        // Solicitud creada antes de la regla (o desde otro cliente): al recibir se rechaza.
        $transfer = Transfer::create([
            'from_warehouse_id' => $this->exhA->id, 'to_warehouse_id' => $this->exhB->id,
            'user_id' => $this->admin->id, 'status' => Transfer::STATUS_PENDING,
        ]);
        TransferItem::create(['transfer_id' => $transfer->id, 'product_id' => $this->bundle->id, 'quantity' => 2]);

        $this->actingAs($this->admin)
            ->putJson("/api/v1/transfers/{$transfer->id}/complete")
            ->assertStatus(422)
            ->assertJsonFragment(['error' => 'Este traslado incluye paquetes («Paquete Test» PAQ-0001) y no se puede recibir: cancélalo, desarma el paquete en la tienda origen y ármalo en la destino.']);

        $this->assertSame(Transfer::STATUS_PENDING, $transfer->fresh()->status);
        $this->assertSame(3.0, $this->qty($this->bundle, $this->exhA));
        $this->assertSame(0.0, $this->qty($this->bundle, $this->exhB));

        // Cancelarlo sigue permitido (es la salida).
        $this->actingAs($this->admin)->putJson("/api/v1/transfers/{$transfer->id}/cancel")->assertOk();
    }

    public function test_los_componentes_sueltos_si_se_trasladan(): void
    {
        $this->actingAs($this->admin)
            ->postJson('/api/v1/transfers', $this->payload([['product_id' => $this->a->id, 'quantity' => 2]]))
            ->assertCreated();
        $transfer = Transfer::query()->firstOrFail();

        $this->actingAs($this->admin)->putJson("/api/v1/transfers/{$transfer->id}/complete")->assertOk();
        $this->assertSame(0.0, $this->qty($this->a, $this->exhA)); // 5 − 3 armados − 2 trasladados
        $this->assertSame(2.0, $this->qty($this->a, $this->exhB));
    }
}
