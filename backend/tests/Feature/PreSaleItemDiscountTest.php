<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\CashMovement;
use App\Models\CashRegister;
use App\Models\CashRegisterSession;
use App\Models\Company;
use App\Models\Customer;
use App\Models\PaymentMethod;
use App\Models\PreSaleCatalog;
use App\Models\PreSaleOrder;
use App\Models\PreSaleOrderItem;
use App\Models\SaleCancellation;
use App\Models\Store;
use App\Models\SystemLog;
use App\Models\User;
use App\Support\PresaleItemDiscount;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * Descuento manual por partida al liquidar una preventa (2026-11-16, T-003).
 *
 * Caso de tienda: la pieza llega dañada y al entregarla se le hace descuento,
 * igual que a un producto en Caja ($ o %, por pieza o por línea, motivo y nota).
 *
 * Reglas (Joel):
 *  - El descuento es de una pieza que se entrega en esa visita.
 *  - Tope: lo que le FALTA pagar a la pieza (anticipo parejo por pieza, el
 *    mismo reparto que Caja). Nunca sale dinero de la caja.
 *  - El neto de la partida (precio − descuento) es lo que cuenta para el total
 *    del folio, su saldo y la regla «pagado ≥ entregado».
 *  - Revertir la entrega quita el descuento: la pieza vuelve a su precio.
 */
class PreSaleItemDiscountTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;
    private Store $store;
    private User $cashier;
    private Customer $customer;
    private PaymentMethod $cash;
    private CashRegisterSession $session;

    protected function setUp(): void
    {
        parent::setUp();

        $this->company  = Company::create(['name' => 'Test Co']);
        $this->store    = Store::create(['company_id' => $this->company->id, 'name' => 'Centro']);
        $this->cashier  = User::create([
            'name' => 'Cajero', 'email' => 'cajero@test.com', 'password' => bcrypt('x'),
            'company_id' => $this->company->id, 'store_id' => $this->store->id,
        ]);
        $this->customer = Customer::create(['name' => 'Ana Torres']);
        $this->cash     = PaymentMethod::create([
            'name' => 'Efectivo', 'allow_cash' => true, 'allow_card' => false, 'active' => true,
        ]);

        $register = CashRegister::create(['store_id' => $this->store->id, 'name' => 'Caja 1', 'active' => true]);
        $this->session = CashRegisterSession::create([
            'register_id' => $register->id, 'user_id' => $this->cashier->id,
            'opening_cash' => 0, 'opened_at' => now(), 'status' => 'open',
        ]);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private function makeCatalog(string $name, float $price, bool $arrived): PreSaleCatalog
    {
        $catalog = PreSaleCatalog::create([
            'product_name' => $name,
            'price_1'      => $price,
            'cost'         => $arrived ? round($price * 0.6, 2) : null,
            'status'       => $arrived ? PreSaleCatalog::STATUS_ARRIVED : PreSaleCatalog::STATUS_PUBLISHED,
            'created_by'   => $this->cashier->id,
        ]);
        $catalog->storeLimits()->create(['store_id' => $this->store->id, 'limit_qty' => 50]);

        return $catalog;
    }

    /**
     * A $1,000 y B $500 ya llegaron; C $300 sigue en camino. Anticipo $600:
     * $200 por pieza → a A le faltan $800, a B $300 y a C $100.
     *
     * @return array{0: PreSaleOrder, 1: array<int, PreSaleOrderItem>}
     */
    private function threeItemOrder(): array
    {
        $order = PreSaleOrder::create([
            'code' => 'PREV-' . uniqid(), 'store_id' => $this->store->id, 'user_id' => $this->cashier->id,
            'customer_id' => $this->customer->id, 'status' => PreSaleOrder::STATUS_READY,
        ]);

        $items = [];
        foreach ([['Figura A', 1000, true], ['Figura B', 500, true], ['Figura C', 300, false]] as [$name, $price, $arrived]) {
            $catalog = $this->makeCatalog($name, $price, $arrived);
            $items[] = $order->items()->create([
                'pre_sale_catalog_id' => $catalog->id, 'quantity' => 1, 'price_level' => 1,
                'unit_price' => $price, 'cost' => $catalog->cost, 'status' => PreSaleOrderItem::STATUS_PENDING,
            ]);
        }
        $order->payments()->create([
            'amount' => 600, 'payment_method_id' => $this->cash->id,
            'cashier_id' => $this->cashier->id, 'notes' => 'Anticipo inicial',
        ]);

        return [$order, $items];
    }

    /** @param array<string, mixed> $body */
    private function deliver(PreSaleOrder $order, array $body): TestResponse
    {
        return $this->actingAs($this->cashier)
            ->patchJson("/api/v1/pre-sale-orders/{$order->id}/status", ['status' => 'delivered'] + $body);
    }

    /** @return array<string, mixed> */
    private function discount(PreSaleOrderItem $item, string $kind, float $value, string $basis = 'line'): array
    {
        return ['item_id' => $item->id, 'kind' => $kind, 'basis' => $basis, 'value' => $value, 'reason' => 'danado', 'note' => 'Caja golpeada'];
    }

    // ── Liquidar con descuento ────────────────────────────────────────────────

    public function test_el_descuento_baja_el_cobro_y_el_total_del_folio(): void
    {
        [$order, [$a, $b]] = $this->threeItemOrder();

        // 20% de $1,000 = $200 a la pieza dañada: hoy se cobran $600 + $300.
        $this->deliver($order, [
            'item_ids'       => [$a->id, $b->id],
            'payment'        => ['amount' => 900, 'payment_method_id' => $this->cash->id],
            'item_discounts' => [$this->discount($a, 'percent', 20)],
        ])->assertOk()
            ->assertJsonPath('data.total', 1600)
            ->assertJsonPath('data.paid_amount', 1500)
            ->assertJsonPath('data.balance', 100);

        $a->refresh();
        $this->assertSame('delivered', $a->status);
        $this->assertEquals(200.0, (float) $a->discount_amount);
        $this->assertSame('percent', $a->discount_kind);
        $this->assertEquals(20.0, (float) $a->discount_value);
        $this->assertSame('danado', $a->discount_reason);
        $this->assertSame('Caja golpeada', $a->discount_note);
        $this->assertSame($this->cashier->id, $a->discount_authorized_by);
        $this->assertEquals(800.0, $a->subtotal);
        $this->assertEquals(1000.0, $a->gross_total);
        $this->assertEquals(0.0, (float) $b->refresh()->discount_amount);

        $log = SystemLog::where('action', 'pre_sale_order.delivery')->sole();
        $this->assertStringContainsString('desc. $200.00', $log->description);
        $this->assertEquals(200.0, $log->meta['discounts'][0]['amount']);
    }

    public function test_el_resource_expone_el_neto_y_el_descuento(): void
    {
        [$order, [$a]] = $this->threeItemOrder();

        $response = $this->deliver($order, [
            'item_ids'       => [$a->id],
            'payment'        => ['amount' => 700, 'payment_method_id' => $this->cash->id],
            'item_discounts' => [$this->discount($a, 'fixed', 100)],
        ])->assertOk();

        $line = collect($response->json('data.items'))->firstWhere('id', $a->id);
        $this->assertEquals(900, $line['subtotal']);
        $this->assertEquals(1000, $line['gross_total']);
        $this->assertEquals(100, $line['discount_amount']);
        $this->assertSame('danado', $line['discount_reason']);
    }

    public function test_el_descuento_puede_cubrir_justo_lo_que_falta_sin_cobro(): void
    {
        [$order, [, $b]] = $this->threeItemOrder();

        // A B le faltan $300: con $300 de descuento se entrega sin cobrar.
        $this->deliver($order, [
            'item_ids'       => [$b->id],
            'item_discounts' => [$this->discount($b, 'fixed', 300)],
        ])->assertOk()->assertJsonPath('data.paid_amount', 600);

        $this->assertSame('delivered', $b->refresh()->status);
        $this->assertEquals(200.0, $b->subtotal);
    }

    public function test_rechaza_un_descuento_mayor_a_lo_que_falta_y_no_guarda_nada(): void
    {
        [$order, [, $b]] = $this->threeItemOrder();

        $this->deliver($order, [
            'item_ids'       => [$b->id],
            'payment'        => ['amount' => 10, 'payment_method_id' => $this->cash->id],
            'item_discounts' => [$this->discount($b, 'percent', 70)], // $350 > $300
        ])->assertStatus(422)
            ->assertJsonPath('error', 'El descuento de "Figura B" no puede ser mayor a lo que le falta pagar ($300.00).');

        $b->refresh();
        $this->assertSame('pending', $b->status);
        $this->assertEquals(0.0, (float) $b->discount_amount);
        $this->assertNull($b->discount_kind);
        $this->assertEquals(600.0, (float) $order->payments()->sum('amount'));
    }

    public function test_el_tope_cuenta_lo_ya_entregado(): void
    {
        [$order, [$a, $b]] = $this->threeItemOrder();
        // Primero A sin descuento: se cobran sus $800; el anticipo de B y C sigue en $400.
        $this->deliver($order, [
            'item_ids' => [$a->id],
            'payment'  => ['amount' => 800, 'payment_method_id' => $this->cash->id],
        ])->assertOk();

        // A B le siguen faltando $300: $301 no pasa, $300 sí.
        $this->deliver($order, ['item_ids' => [$b->id], 'item_discounts' => [$this->discount($b, 'fixed', 301)]])
            ->assertStatus(422);
        $this->deliver($order, ['item_ids' => [$b->id], 'item_discounts' => [$this->discount($b, 'fixed', 300)]])
            ->assertOk();
    }

    public function test_rechaza_descuento_de_una_pieza_que_no_se_entrega_hoy(): void
    {
        [$order, [$a, $b]] = $this->threeItemOrder();

        $this->deliver($order, [
            'item_ids'       => [$a->id],
            'payment'        => ['amount' => 800, 'payment_method_id' => $this->cash->id],
            'item_discounts' => [$this->discount($b, 'fixed', 50)],
        ])->assertStatus(422)->assertJsonValidationErrors('item_discounts.0.item_id');
    }

    public function test_rechaza_porcentaje_mayor_a_100_y_motivo_desconocido(): void
    {
        [$order, [$a]] = $this->threeItemOrder();

        $this->deliver($order, [
            'item_ids'       => [$a->id],
            'item_discounts' => [$this->discount($a, 'percent', 120)],
        ])->assertStatus(422)->assertJsonValidationErrors('item_discounts.0.value');

        $this->deliver($order, [
            'item_ids'       => [$a->id],
            'item_discounts' => [['item_id' => $a->id, 'kind' => 'fixed', 'basis' => 'line', 'value' => 10, 'reason' => 'porque si']],
        ])->assertStatus(422)->assertJsonValidationErrors('item_discounts.0.reason');
    }

    public function test_el_descuento_por_pieza_multiplica_por_las_piezas(): void
    {
        $this->assertEquals(150.0, PresaleItemDiscount::amount('fixed', 'unit', 50, 400, 3));
        $this->assertEquals(50.0, PresaleItemDiscount::amount('fixed', 'line', 50, 400, 3));
        $this->assertEquals(120.0, PresaleItemDiscount::amount('percent', 'line', 10, 400, 3));
        $this->assertEquals(400.0, PresaleItemDiscount::amount('fixed', 'line', 999, 400, 1), 'nunca más que el bruto');
    }

    // ── Revertir ──────────────────────────────────────────────────────────────

    public function test_revertir_la_entrega_quita_el_descuento(): void
    {
        [$order, [$a, $b]] = $this->threeItemOrder();
        $this->deliver($order, [
            'item_ids'       => [$a->id, $b->id],
            'payment'        => ['amount' => 900, 'payment_method_id' => $this->cash->id],
            'item_discounts' => [$this->discount($a, 'percent', 20)],
        ])->assertOk();

        $this->actingAs($this->cashier)->postJson("/api/v1/pre-sale-orders/{$order->id}/cancel", [
            'mode' => 'liquidation_rollback', 'reason_code' => 'error_cajero',
            'cash_session_id' => $this->session->id,
        ])->assertOk()->assertJsonPath('data.cancellation.amount_refunded', 900);

        $a->refresh();
        $this->assertSame('pending', $a->status);
        $this->assertEquals(0.0, (float) $a->discount_amount);
        $this->assertNull($a->discount_kind);
        $this->assertNull($a->discount_reason);
        $this->assertNull($a->discount_authorized_by);

        $order = PreSaleOrder::with(['items', 'payments'])->find($order->id);
        $this->assertEquals(1800.0, $order->total, 'el folio vuelve a su precio completo');
        $this->assertEquals(1200.0, $order->balance);
        $this->assertEquals(900.0, (float) CashMovement::where('type', 'salida')->sum('amount'));

        // El snapshot guarda lo que se revirtió: neto, bruto y el descuento.
        $snap = collect(SaleCancellation::where('pre_sale_order_id', $order->id)->sole()->items_snapshot)
            ->firstWhere('pre_sale_order_item_id', $a->id);
        $this->assertEquals(800.0, $snap['line_total']);
        $this->assertEquals(1000.0, $snap['gross_total']);
        $this->assertEquals(200.0, $snap['discount_cancelled']);
    }

    public function test_reporte_de_preventas_suma_el_neto(): void
    {
        [$order, [$a]] = $this->threeItemOrder();
        $this->deliver($order, [
            'item_ids'       => [$a->id],
            'payment'        => ['amount' => 700, 'payment_method_id' => $this->cash->id],
            'item_discounts' => [$this->discount($a, 'fixed', 100)],
        ])->assertOk();

        $today    = now()->toDateString();
        $response = $this->actingAs($this->cashier)
            ->getJson("/api/v1/reports/pre-sales?from={$today}&to={$today}&store_id={$this->store->id}")
            ->assertOk();
        $this->assertEquals(1700.0, (float) $response->json('data.summary.total_revenue'));
    }
}
