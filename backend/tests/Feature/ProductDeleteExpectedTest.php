<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Product;
use App\Models\SystemLog;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\Feature\Concerns\BuildsBundleWorld;
use Tests\TestCase;

/**
 * DELETE /products/{id}, /products/{id}/force y /mangas/{id} con `expected`
 * (2026-10-09): los conteos de la vista previa viajan de regreso y si cambiaron
 * no se borra. Sin `expected` (app móvil, PWA vieja) todo sigue igual.
 */
class ProductDeleteExpectedTest extends TestCase
{
    use RefreshDatabase;
    use BuildsBundleWorld;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buildBundleWorld();
    }

    /** @return array<string, mixed> */
    private function counts(Product $product, ?User $as = null): array
    {
        return $this->actingAs($as ?? $this->admin)
            ->getJson("/api/v1/products/{$product->id}/delete-preview")
            ->assertOk()
            ->json('data.counts');
    }

    private function makeLayaway(Product $product): void
    {
        $customerId = DB::table('customers')->insertGetId(['name' => 'Cliente', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('layaways')->insert([
            'code' => 'AP-'.strtoupper(uniqid()), 'store_id' => $this->storeA->id, 'user_id' => $this->admin->id,
            'customer_id' => $customerId, 'product_id' => $product->id, 'quantity' => 1, 'price' => 100,
            'total' => 100, 'down_payment' => 50, 'status' => 'active', 'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    public function test_delete_sin_body_sigue_funcionando_como_siempre(): void
    {
        $product = $this->makeProduct('Figura');
        $this->stock($product, $this->exhA, 4);

        $this->actingAs($this->admin)->deleteJson("/api/v1/products/{$product->id}")
            ->assertOk()
            ->assertJsonPath('message', 'Producto eliminado.');

        $this->assertDatabaseMissing('products', ['id' => $product->id]);
        $log = SystemLog::query()->where('action', 'product.deleted')->where('entity_id', $product->id)->firstOrFail();
        $this->assertSame(4.0, (float) $log->meta['audit']['stock_total']);
        $this->assertSame($this->storeA->id, $log->meta['audit']['stores'][0]['store_id']);
    }

    public function test_delete_con_expected_correcto_borra(): void
    {
        $product = $this->makeProduct('Figura');
        $this->stock($product, $this->exhA, 4);

        $this->actingAs($this->admin)
            ->deleteJson("/api/v1/products/{$product->id}", ['expected' => $this->counts($product)])
            ->assertOk();

        $this->assertDatabaseMissing('products', ['id' => $product->id]);
    }

    public function test_si_el_stock_cambio_despues_de_la_vista_previa_no_borra(): void
    {
        $product = $this->makeProduct('Figura');
        $this->stock($product, $this->exhA, 4);
        $expected = $this->counts($product);

        $this->stock($product, $this->exhB, 1); // entró stock en otra tienda

        $this->actingAs($this->admin)
            ->deleteJson("/api/v1/products/{$product->id}", ['expected' => $expected])
            ->assertStatus(422)
            ->assertJsonPath('error', 'El producto cambió mientras revisabas (stock, apartados o traslados). Vuelve a abrir la vista previa.');

        $this->assertDatabaseHas('products', ['id' => $product->id]);
    }

    public function test_force_con_expected_desfasado_no_borra(): void
    {
        $product = $this->makeProduct('Figura');
        $this->makeLayaway($product);
        $expected = $this->counts($product);

        $this->makeLayaway($product); // apareció otro apartado

        $this->actingAs($this->admin)
            ->deleteJson("/api/v1/products/{$product->id}/force", ['expected' => $expected])
            ->assertStatus(422);

        $this->assertDatabaseHas('products', ['id' => $product->id]);
        $this->assertSame(2, DB::table('layaways')->where('product_id', $product->id)->count());
    }

    public function test_tomo_con_expected_desfasado_no_borra(): void
    {
        $tomo = $this->makeProduct('Tomo 1', type: Product::TYPE_MANGA);
        $this->stock($tomo, $this->exhA, 2);
        $expected = $this->counts($tomo);

        $this->stock($tomo, $this->exhA, 3);

        $this->actingAs($this->admin)
            ->deleteJson("/api/v1/mangas/{$tomo->id}", ['expected' => $expected])
            ->assertStatus(422);

        $this->assertDatabaseHas('products', ['id' => $tomo->id]);

        // Con el conteo fresco sí se borra.
        $this->actingAs($this->admin)
            ->deleteJson("/api/v1/mangas/{$tomo->id}", ['expected' => $this->counts($tomo)])
            ->assertOk()
            ->assertJsonPath('message', 'Manga eliminado.');
        $this->assertDatabaseMissing('products', ['id' => $tomo->id]);
    }

    public function test_el_mensaje_de_apartado_se_conserva_tal_cual(): void
    {
        $product = $this->makeProduct('Figura');
        $this->makeLayaway($product);

        $this->actingAs($this->admin)->deleteJson("/api/v1/products/{$product->id}")
            ->assertStatus(422)
            ->assertJsonPath('error', 'No se puede eliminar: el producto tiene 1 apartado(s). Puedes desactivarlo.');

        $tomo = $this->makeProduct('Tomo 1', type: Product::TYPE_MANGA);
        $this->makeLayaway($tomo);
        $this->actingAs($this->admin)->deleteJson("/api/v1/mangas/{$tomo->id}")
            ->assertStatus(422)
            ->assertJsonPath('error', 'No se puede eliminar: el tomo tiene 1 apartado(s). Puedes desactivarlo.');
    }

    public function test_force_borra_apartados_y_deja_auditoria(): void
    {
        $product = $this->makeProduct('Figura');
        $this->makeLayaway($product);
        $this->stock($product, $this->exhA, 4);

        $this->actingAs($this->admin)
            ->deleteJson("/api/v1/products/{$product->id}/force", ['expected' => $this->counts($product)])
            ->assertOk();

        $this->assertDatabaseMissing('products', ['id' => $product->id]);
        $this->assertSame(0, DB::table('layaways')->where('product_id', $product->id)->count());
        $log = SystemLog::query()->where('action', 'product.force_deleted')->where('entity_id', $product->id)->firstOrFail();
        $this->assertSame(1, $log->meta['audit']['layaways_deleted']);
        $this->assertSame(4.0, (float) $log->meta['audit']['stock_total']);
    }

    public function test_expected_invalido_es_422_de_validacion(): void
    {
        $product = $this->makeProduct('Figura');

        $this->actingAs($this->admin)
            ->deleteJson("/api/v1/products/{$product->id}", ['expected' => ['stock_total' => 'muchos']])
            ->assertStatus(422);

        $this->assertDatabaseHas('products', ['id' => $product->id]);
    }
}
