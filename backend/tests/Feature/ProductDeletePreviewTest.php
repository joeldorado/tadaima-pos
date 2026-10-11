<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\PreSaleCatalog;
use App\Models\PreSaleOrder;
use App\Models\PreSaleOrderItem;
use App\Models\Product;
use App\Models\Transfer;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;
use Tests\Feature\Concerns\BuildsBundleWorld;
use Tests\TestCase;

/**
 * GET /products/{id}/delete-preview (2026-10-09): lo que se enseña antes de
 * eliminar un producto o tomo — stock por tienda, apartados, preventas,
 * traslados, paquetes, promos, avisos y bloqueos.
 */
class ProductDeletePreviewTest extends TestCase
{
    use RefreshDatabase;
    use BuildsBundleWorld;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buildBundleWorld();
    }

    private function preview(Product $product, ?User $as = null): TestResponse
    {
        return $this->actingAs($as ?? $this->admin)->getJson("/api/v1/products/{$product->id}/delete-preview");
    }

    /** @param array<string, mixed> $data */
    private function storeRow(array $data, int $storeId): ?array
    {
        return collect($data['stock']['stores'])->firstWhere('store_id', $storeId);
    }

    private function makeLayaway(Product $product, string $status = 'active'): void
    {
        $customerId = DB::table('customers')->insertGetId(['name' => 'Cliente', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('layaways')->insert([
            'code' => 'AP-'.strtoupper(uniqid()), 'store_id' => $this->storeA->id, 'user_id' => $this->admin->id,
            'customer_id' => $customerId, 'product_id' => $product->id, 'quantity' => 1, 'price' => 100,
            'total' => 100, 'down_payment' => 50, 'status' => $status, 'created_at' => now(), 'updated_at' => now(),
        ]);
    }

    public function test_admin_ve_el_stock_por_tienda_y_el_aviso(): void
    {
        $product = $this->makeProduct('Figura Goku');
        $this->stock($product, $this->exhA, 3);
        $this->stock($product, $this->bodA, 2);
        $this->stock($product, $this->exhB, 5);

        $data = $this->preview($product)->assertOk()->json('data');

        $this->assertSame('Figura Goku', $data['product']['name']);
        $this->assertSame(10.0, (float) $data['stock']['total']);
        $this->assertCount(2, $data['stock']['stores']);

        $macro = $this->storeRow($data, $this->storeA->id);
        $this->assertSame('Macro', $macro['store_name']);
        $this->assertSame(3.0, (float) $macro['exhibicion']);
        $this->assertSame(2.0, (float) $macro['bodega']);
        $this->assertSame(5.0, (float) $macro['total']);

        $centro = $this->storeRow($data, $this->storeB->id);
        $this->assertSame(5.0, (float) $centro['exhibicion']);
        $this->assertSame(0.0, (float) $centro['bodega']);

        $this->assertSame(10.0, (float) $data['counts']['stock_total']);
        $this->assertStringContainsString('10 pieza(s) en existencia en 2 tienda(s)', implode(' ', $data['warnings']));
        $this->assertSame([], $data['blockers']);
        $this->assertSame([], $data['force_blockers']);
    }

    public function test_sin_stock_no_lista_tiendas_ni_avisa(): void
    {
        $product = $this->makeProduct('Sin stock');
        $this->stock($product, $this->exhA, 0);

        $data = $this->preview($product)->assertOk()->json('data');

        $this->assertSame(0.0, (float) $data['stock']['total']);
        $this->assertSame([], $data['stock']['stores']);
        $this->assertSame([], $data['warnings']);
    }

    public function test_gerente_con_costo_ve_su_tienda_primero(): void
    {
        $this->gerenteA->update(['can_view_cost' => true]);
        $product = $this->makeProduct('Figura');
        // "Centro" va antes que "Macro" por nombre: la tienda del gerente gana igual.
        $this->stock($product, $this->exhB, 5);
        $this->stock($product, $this->exhA, 1);

        $data = $this->preview($product, $this->gerenteA->fresh())->assertOk()->json('data');

        $this->assertSame($this->storeA->id, $data['stock']['stores'][0]['store_id']);
        $this->assertTrue($data['stock']['stores'][0]['is_mine']);
        $this->assertSame($this->storeB->id, $data['stock']['stores'][1]['store_id']);
        $this->assertFalse($data['stock']['stores'][1]['is_mine']);
    }

    public function test_cajero_y_gerente_sin_costo_no_pueden_ver_la_vista_previa(): void
    {
        $product = $this->makeProduct('Figura');

        $this->preview($product, $this->cajeroA)->assertStatus(403);
        $this->preview($product, $this->gerenteA)->assertStatus(403);
    }

    public function test_apartado_bloquea_solo_el_borrado_normal(): void
    {
        $product = $this->makeProduct('Figura');
        $this->makeLayaway($product);

        $data = $this->preview($product)->assertOk()->json('data');

        $this->assertSame(['No se puede eliminar: el producto tiene 1 apartado(s). Puedes desactivarlo.'], $data['blockers']);
        $this->assertSame([], $data['force_blockers']);
        $this->assertSame(1, $data['layaways']['total']);
        $this->assertSame(1, $data['layaways']['open']);
        $this->assertSame(1, $data['counts']['layaways']);
        $this->assertStringContainsString('1 apartado(s) (1 abierto(s))', implode(' ', $data['force_warnings']));
    }

    public function test_el_tomo_con_apartado_dice_tomo(): void
    {
        $tomo = $this->makeProduct('Tomo 1', type: Product::TYPE_MANGA);
        $this->makeLayaway($tomo, 'cancelled');

        $data = $this->preview($tomo)->assertOk()->json('data');

        $this->assertSame('manga', $data['product']['product_type']);
        $this->assertSame(['No se puede eliminar: el tomo tiene 1 apartado(s). Puedes desactivarlo.'], $data['blockers']);
        $this->assertSame(0, $data['layaways']['open']);
    }

    public function test_componente_de_paquete_bloquea_tambien_el_borrado_total(): void
    {
        $comp1 = $this->makeProduct('Comp 1');
        $comp2 = $this->makeProduct('Comp 2');
        $bundle = $this->createBundle([
            ['product_id' => $comp1->id, 'quantity' => 1],
            ['product_id' => $comp2->id, 'quantity' => 1],
        ]);

        $data = $this->preview($comp1)->assertOk()->json('data');

        $this->assertStringContainsString('es componente del paquete', $data['blockers'][0] ?? '');
        $this->assertStringContainsString('es componente del paquete', $data['force_blockers'][0] ?? '');
        $this->assertSame($bundle->id, $data['bundles']['component_of'][0]['id']);
    }

    public function test_paquete_armado_bloquea(): void
    {
        $comp1 = $this->makeProduct('Comp 1');
        $comp2 = $this->makeProduct('Comp 2');
        $this->stock($comp1, $this->exhA, 5);
        $this->stock($comp2, $this->exhA, 5);
        $bundle = $this->createBundle([
            ['product_id' => $comp1->id, 'quantity' => 1],
            ['product_id' => $comp2->id, 'quantity' => 1],
        ]);
        $this->assemble($bundle, $this->storeA, 1)->assertOk();

        $data = $this->preview($bundle)->assertOk()->json('data');

        $this->assertSame(1.0, (float) $data['bundles']['assembled_stock']);
        $this->assertContains('No se puede eliminar: el paquete tiene inventario (armados o un ajuste negativo). Desármalo o corrígelo desde Paquetes.', $data['force_blockers']);
    }

    public function test_traslado_pendiente_avisa_y_el_completado_no(): void
    {
        $product = $this->makeProduct('Figura');
        foreach ([Transfer::STATUS_PENDING, Transfer::STATUS_COMPLETED] as $status) {
            $transfer = Transfer::create([
                'from_warehouse_id' => $this->exhA->id, 'to_warehouse_id' => $this->exhB->id,
                'user_id' => $this->admin->id, 'status' => $status,
            ]);
            DB::table('transfer_items')->insert(['transfer_id' => $transfer->id, 'product_id' => $product->id, 'quantity' => 2]);
        }

        $data = $this->preview($product)->assertOk()->json('data');

        $this->assertSame(1, $data['transfers']['pending']);
        $this->assertSame(1, $data['counts']['transfers_pending']);
        $this->assertStringContainsString('1 traslado(s) pendiente(s)', implode(' ', $data['warnings']));
    }

    public function test_preventas_y_promos_se_cuentan(): void
    {
        $product = $this->makeProduct('Figura');
        $catalog = PreSaleCatalog::create([
            'product_name' => 'Figura preventa', 'price_1' => 100, 'product_id' => $product->id,
            'status' => PreSaleCatalog::STATUS_PUBLISHED, 'created_by' => $this->admin->id,
        ]);
        $customerId = DB::table('customers')->insertGetId(['name' => 'Cliente', 'created_at' => now(), 'updated_at' => now()]);
        $order = PreSaleOrder::create([
            'code' => 'PREV-0001', 'customer_id' => $customerId, 'store_id' => $this->storeA->id,
            'user_id' => $this->admin->id, 'status' => PreSaleOrder::STATUS_PENDING,
        ]);
        PreSaleOrderItem::create([
            'pre_sale_order_id' => $order->id, 'pre_sale_catalog_id' => $catalog->id,
            'quantity' => 1, 'unit_price' => 100, 'status' => PreSaleOrderItem::STATUS_PENDING,
        ]);
        $promoId = DB::table('product_promotions')->insertGetId([
            'product_id' => $product->id, 'name' => '2x1', 'buy_n' => 2, 'pay_m' => 1, 'status' => 'active',
            'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('product_promotion_assignments')->insert([
            'promotion_id' => $promoId, 'product_id' => $product->id, 'created_at' => now(), 'updated_at' => now(),
        ]);

        $data = $this->preview($product)->assertOk()->json('data');

        $this->assertSame(1, $data['presales']['catalogs']);
        $this->assertSame(1, $data['presales']['open_items']);
        $this->assertSame(1, $data['promos']['count']);
        $warnings = implode(' ', $data['warnings']);
        $this->assertStringContainsString('1 catálogo(s) de preventa', $warnings);
        $this->assertStringContainsString('1 promoción(es)', $warnings);
    }
}
