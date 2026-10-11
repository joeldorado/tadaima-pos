<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\PaymentMethod;
use App\Models\PreSaleCatalog;
use App\Models\PreSaleOrder;
use App\Models\PreSaleOrderItem;
use App\Models\PreSaleOrderPayment;
use App\Models\Store;
use App\Models\SystemLog;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;
use Tests\Feature\Concerns\BuildsBundleWorld;
use Tests\TestCase;

/**
 * "Cancelar catálogo" con vista previa (2026-10-09): GET cancel-preview enseña
 * folios, anticipos y tiendas; PATCH status=cancelled respeta `expected`,
 * cancela en transacción y deja logs. Los anticipos cobrados NO bloquean
 * (decisión de Joel): se avisa que ese dinero no se devuelve solo.
 */
class PreSaleCatalogCancelPreviewTest extends TestCase
{
    use RefreshDatabase;
    use BuildsBundleWorld;

    private int $customerId;

    protected function setUp(): void
    {
        parent::setUp();
        $this->buildBundleWorld();
        $this->customerId = DB::table('customers')->insertGetId(['name' => 'Cliente', 'created_at' => now(), 'updated_at' => now()]);
    }

    private function makeCatalog(string $status = PreSaleCatalog::STATUS_PUBLISHED, string $name = 'Figura preventa'): PreSaleCatalog
    {
        return PreSaleCatalog::create([
            'product_name' => $name, 'price_1' => 100, 'status' => $status, 'created_by' => $this->admin->id,
        ]);
    }

    /** Folio con UN artículo del catálogo (qty 1 × $100) y, opcionalmente, un anticipo. */
    private function makeOrder(PreSaleCatalog $catalog, Store $store, string $status, float $paid = 0, ?PaymentMethod $method = null): PreSaleOrder
    {
        $order = PreSaleOrder::create([
            'code' => 'PREV-'.strtoupper(uniqid()), 'customer_id' => $this->customerId, 'store_id' => $store->id,
            'user_id' => $this->admin->id, 'status' => $status,
        ]);
        PreSaleOrderItem::create([
            'pre_sale_order_id' => $order->id, 'pre_sale_catalog_id' => $catalog->id, 'quantity' => 1,
            'unit_price' => 100, 'status' => $status === PreSaleOrder::STATUS_DELIVERED ? PreSaleOrderItem::STATUS_DELIVERED : PreSaleOrderItem::STATUS_PENDING,
        ]);
        if ($paid > 0) {
            PreSaleOrderPayment::create([
                'pre_sale_order_id' => $order->id, 'amount' => $paid,
                'payment_method_id' => ($method ?? $this->cashMethod())->id, 'cashier_id' => $this->admin->id,
            ]);
        }

        return $order;
    }

    private function preview(PreSaleCatalog $catalog, ?User $as = null): TestResponse
    {
        return $this->actingAs($as ?? $this->admin)->getJson("/api/v1/pre-sale-catalogs/{$catalog->id}/cancel-preview");
    }

    private function cancel(PreSaleCatalog $catalog, ?array $expected = null, ?User $as = null): TestResponse
    {
        $body = ['status' => 'cancelled'];
        if ($expected !== null) {
            $body['expected'] = $expected;
        }

        return $this->actingAs($as ?? $this->admin)->patchJson("/api/v1/pre-sale-catalogs/{$catalog->id}/status", $body);
    }

    public function test_la_vista_previa_cuenta_folios_por_estado_y_dinero(): void
    {
        $catalog = $this->makeCatalog();
        $this->makeOrder($catalog, $this->storeA, PreSaleOrder::STATUS_PENDING, paid: 50);
        $this->makeOrder($catalog, $this->storeA, PreSaleOrder::STATUS_READY);
        $this->makeOrder($catalog, $this->storeA, PreSaleOrder::STATUS_DELIVERED, paid: 100);
        $this->makeOrder($catalog, $this->storeA, PreSaleOrder::STATUS_CANCELLED);

        $data = $this->preview($catalog)->assertOk()->json('data');

        $this->assertTrue($data['catalog']['can_cancel']);
        $this->assertSame(4, $data['folios']['total']);
        $this->assertSame(2, $data['folios']['to_cancel']);
        $this->assertSame(['pending' => 1, 'ready' => 1, 'delivered' => 1, 'expired' => 0, 'cancelled' => 1], $data['folios']['by_status']);
        $this->assertSame(1, $data['folios']['with_money']);
        $this->assertSame(0, $data['folios']['with_card']);
        $this->assertSame(50.0, (float) $data['money']['anticipos_cobrados']);
        $this->assertSame(50.0, (float) $data['money']['anticipos_efectivo']);
        $this->assertSame(150.0, (float) $data['money']['por_cobrar']);
        $this->assertSame(2, $data['units']['reserved']);
        $this->assertSame(1, $data['units']['delivered']);
        $this->assertSame(['to_cancel' => 2, 'with_money' => 1], $data['counts']);
        $this->assertSame([], $data['blockers']);
        $warnings = implode(' ', $data['warnings']);
        $this->assertStringContainsString('Se cancelan 2 folio(s)', $warnings);
        $this->assertStringContainsString('$50.00 en anticipos cobrados de 1 folio(s)', $warnings);
        $this->assertStringContainsString('NO se devuelve', $warnings);
        $this->assertStringContainsString('1 folio(s) ya entregados no se tocan', $warnings);
    }

    public function test_tarjeta_se_cuenta_aparte(): void
    {
        $catalog = $this->makeCatalog();
        $card = PaymentMethod::firstOrCreate(['name' => 'Tarjeta'], ['active' => true]);
        $this->makeOrder($catalog, $this->storeA, PreSaleOrder::STATUS_PENDING, paid: 80, method: $card);
        $this->makeOrder($catalog, $this->storeA, PreSaleOrder::STATUS_PENDING, paid: 20);

        $data = $this->preview($catalog)->assertOk()->json('data');

        $this->assertSame(1, $data['folios']['with_card']);
        $this->assertSame(80.0, (float) $data['money']['anticipos_tarjeta']);
        $this->assertSame(20.0, (float) $data['money']['anticipos_efectivo']);
        $this->assertStringContainsString('1 folio(s) tienen pagos con tarjeta', implode(' ', $data['warnings']));
    }

    public function test_tiendas_con_la_del_gerente_primero_y_aviso_de_otras_tiendas(): void
    {
        $catalog = $this->makeCatalog();
        $this->makeOrder($catalog, $this->storeB, PreSaleOrder::STATUS_PENDING, paid: 30);
        $this->makeOrder($catalog, $this->storeB, PreSaleOrder::STATUS_READY);
        $this->makeOrder($catalog, $this->storeA, PreSaleOrder::STATUS_PENDING);

        $data = $this->preview($catalog, $this->gerenteA)->assertOk()->json('data');

        $this->assertSame($this->storeA->id, $data['stores'][0]['store_id']);
        $this->assertTrue($data['stores'][0]['is_mine']);
        $this->assertSame(1, $data['stores'][0]['folios_to_cancel']);
        $this->assertSame($this->storeB->id, $data['stores'][1]['store_id']);
        $this->assertSame(2, $data['stores'][1]['folios_to_cancel']);
        $this->assertSame(30.0, (float) $data['stores'][1]['anticipos']);
        $this->assertSame(2, $data['folios']['other_stores']);
        $this->assertStringContainsString('2 folio(s) abierto(s) son de otras tiendas', implode(' ', $data['warnings']));

        // El admin no tiene "otras tiendas".
        $this->assertSame(0, $this->preview($catalog)->json('data.folios.other_stores'));
    }

    public function test_cajero_no_ve_la_vista_previa(): void
    {
        $catalog = $this->makeCatalog();

        $this->preview($catalog, $this->cajeroA)->assertStatus(403);
    }

    public function test_cancelar_con_anticipos_se_permite_y_deja_logs(): void
    {
        $catalog = $this->makeCatalog();
        $pending = $this->makeOrder($catalog, $this->storeA, PreSaleOrder::STATUS_PENDING, paid: 50);
        $ready = $this->makeOrder($catalog, $this->storeB, PreSaleOrder::STATUS_READY);
        $delivered = $this->makeOrder($catalog, $this->storeA, PreSaleOrder::STATUS_DELIVERED, paid: 100);
        $expected = $this->preview($catalog)->json('data.counts');

        $this->cancel($catalog, $expected)
            ->assertOk()
            ->assertJsonPath('data.status', 'cancelled');

        $this->assertSame('cancelled', $pending->fresh()->status);
        $this->assertSame('cancelled', $ready->fresh()->status);
        $this->assertSame('delivered', $delivered->fresh()->status);
        // El dinero NO se toca (se avisó): el pago sigue registrado.
        $this->assertSame(1, PreSaleOrderPayment::query()->where('pre_sale_order_id', $pending->id)->count());

        $this->assertDatabaseHas('pre_sale_order_logs', ['pre_sale_order_id' => $pending->id, 'from_status' => 'pending', 'to_status' => 'cancelled', 'user_id' => $this->admin->id]);
        $this->assertDatabaseHas('pre_sale_order_logs', ['pre_sale_order_id' => $ready->id, 'from_status' => 'ready', 'to_status' => 'cancelled']);
        $this->assertDatabaseMissing('pre_sale_order_logs', ['pre_sale_order_id' => $delivered->id]);

        $log = SystemLog::query()->where('action', 'pre_sale_catalog.cancelled')->where('entity_id', $catalog->id)->firstOrFail();
        $this->assertSame(2, $log->meta['preview']['counts']['to_cancel']);
        $this->assertSame(50.0, (float) $log->meta['preview']['money']['anticipos_cobrados']);
        $this->assertStringContainsString('$50.00', (string) $log->description);
    }

    public function test_si_entraron_folios_despues_de_la_vista_previa_no_cancela(): void
    {
        $catalog = $this->makeCatalog();
        $this->makeOrder($catalog, $this->storeA, PreSaleOrder::STATUS_PENDING);
        $expected = $this->preview($catalog)->json('data.counts');

        $nuevo = $this->makeOrder($catalog, $this->storeA, PreSaleOrder::STATUS_PENDING);

        $this->cancel($catalog, $expected)
            ->assertStatus(422)
            ->assertJsonPath('error', 'El catálogo cambió mientras revisabas (entraron folios o cobros). Vuelve a abrir la vista previa.');

        $this->assertSame('published', $catalog->fresh()->status);
        $this->assertSame('pending', $nuevo->fresh()->status);
        $this->assertDatabaseMissing('pre_sale_order_logs', ['pre_sale_order_id' => $nuevo->id]);
    }

    public function test_sin_expected_sigue_cancelando_como_siempre(): void
    {
        $catalog = $this->makeCatalog();
        $order = $this->makeOrder($catalog, $this->storeA, PreSaleOrder::STATUS_PENDING);

        $this->cancel($catalog)->assertOk();

        $this->assertSame('cancelled', $catalog->fresh()->status);
        $this->assertSame('cancelled', $order->fresh()->status);
    }

    public function test_folio_con_articulos_de_otro_catalogo_avisa(): void
    {
        $catalog = $this->makeCatalog();
        $otro = $this->makeCatalog(name: 'Otro catálogo');
        $order = $this->makeOrder($catalog, $this->storeA, PreSaleOrder::STATUS_PENDING);
        PreSaleOrderItem::create([
            'pre_sale_order_id' => $order->id, 'pre_sale_catalog_id' => $otro->id, 'quantity' => 3,
            'unit_price' => 100, 'status' => PreSaleOrderItem::STATUS_PENDING,
        ]);

        $data = $this->preview($catalog)->assertOk()->json('data');

        $this->assertSame(1, $data['folios']['mixed']);
        // Las unidades reservadas son SOLO las de este catálogo.
        $this->assertSame(1, $data['units']['reserved']);
        $this->assertStringContainsString('artículos de otros catálogos', implode(' ', $data['warnings']));
    }

    public function test_catalogo_completado_o_cancelado_no_se_puede_cancelar(): void
    {
        $completed = $this->makeCatalog(PreSaleCatalog::STATUS_COMPLETED);
        $cancelled = $this->makeCatalog(PreSaleCatalog::STATUS_CANCELLED);

        $data = $this->preview($completed)->assertOk()->json('data');
        $this->assertFalse($data['catalog']['can_cancel']);
        $this->assertSame(['Este catálogo ya se completó: no se puede cancelar.'], $data['blockers']);

        $this->assertSame(['Este catálogo ya está cancelado.'], $this->preview($cancelled)->json('data.blockers'));
        $this->cancel($completed)->assertStatus(422);
    }

    public function test_gerente_cancela_y_queda_su_usuario_en_el_log(): void
    {
        $catalog = $this->makeCatalog();
        $order = $this->makeOrder($catalog, $this->storeA, PreSaleOrder::STATUS_PENDING);

        $this->cancel($catalog, $this->preview($catalog, $this->gerenteA)->json('data.counts'), $this->gerenteA)->assertOk();

        $this->assertDatabaseHas('pre_sale_order_logs', ['pre_sale_order_id' => $order->id, 'user_id' => $this->gerenteA->id]);
        $this->assertDatabaseHas('system_logs', ['action' => 'pre_sale_catalog.cancelled', 'user_id' => $this->gerenteA->id]);
    }
}
