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
use App\Models\PreSaleDelivery;
use App\Models\PreSaleOrder;
use App\Models\PreSaleOrderItem;
use App\Models\PreSaleOrderPayment;
use App\Models\Store;
use App\Models\Terminal;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * Preventas con Tarjeta y Mixto (2026-11-23, autorizado por Pier).
 *
 * - El anticipo y la liquidación aceptan `payments[]` (máx. 2): Tarjeta con su
 *   terminal (guarda la comisión que absorbe la tienda) o Mixto (efectivo +
 *   transferencia, sin tarjeta).
 * - Los campos de siempre (app móvil) siguen funcionando igual.
 * - Una entrega en Mixto deja dos pagos ligados a la entrega; revertirla quita
 *   los dos y del cajón sale solo el efectivo.
 * - Regla de siempre: un folio con pago con Tarjeta no se revierte ni cancela.
 */
class PreSaleCardMixtoPaymentTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;

    private Store $store;

    private User $cashier;

    private Customer $customer;

    private PaymentMethod $cash;

    private PaymentMethod $card;

    private PaymentMethod $transfer;

    private Terminal $terminal;

    private CashRegisterSession $session;

    protected function setUp(): void
    {
        parent::setUp();

        $this->company = Company::create(['name' => 'Test Co']);
        $this->store = Store::create(['company_id' => $this->company->id, 'name' => 'Centro']);
        $this->cashier = User::create([
            'name' => 'Cajero', 'email' => 'cajero@test.com', 'password' => bcrypt('x'),
            'company_id' => $this->company->id, 'store_id' => $this->store->id,
        ]);
        $this->customer = Customer::create(['name' => 'Ana Torres']);
        $this->cash = PaymentMethod::create(['name' => 'Efectivo', 'allow_cash' => true, 'allow_card' => false, 'active' => true]);
        $this->card = PaymentMethod::create(['name' => 'Tarjeta Débito', 'allow_cash' => false, 'allow_card' => true, 'active' => true]);
        $this->transfer = PaymentMethod::create(['name' => 'Transferencia', 'allow_cash' => true, 'allow_card' => false, 'active' => true]);
        $this->terminal = Terminal::create([
            'store_id' => $this->store->id, 'name' => 'Clip', 'commission_percent' => 3.5, 'active' => true,
        ]);

        $register = CashRegister::create(['store_id' => $this->store->id, 'name' => 'Caja 1', 'active' => true]);
        $this->session = CashRegisterSession::create([
            'register_id' => $register->id, 'user_id' => $this->cashier->id,
            'opening_cash' => 0, 'opened_at' => now(), 'status' => 'open',
        ]);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private function makeCatalog(float $price, bool $arrived): PreSaleCatalog
    {
        $catalog = PreSaleCatalog::create([
            'product_name' => 'Figura',
            'price_1' => $price,
            'cost' => round($price * 0.6, 2),
            'status' => $arrived ? PreSaleCatalog::STATUS_ARRIVED : PreSaleCatalog::STATUS_PUBLISHED,
            'created_by' => $this->cashier->id,
        ]);
        $catalog->storeLimits()->create(['store_id' => $this->store->id, 'limit_qty' => 50]);

        return $catalog;
    }

    /** @param array<string, mixed> $extra */
    private function createOrder(PreSaleCatalog $catalog, array $extra): TestResponse
    {
        return $this->actingAs($this->cashier)->postJson('/api/v1/pre-sale-orders', [
            'store_id' => $this->store->id,
            'customer_id' => $this->customer->id,
            'items' => [['catalog_id' => $catalog->id, 'quantity' => 1, 'price_level' => 1]],
        ] + $extra);
    }

    /** Folio LISTO de $1,000 con anticipo de $200 en efectivo. */
    private function readyOrder(): array
    {
        $catalog = $this->makeCatalog(1000, true);
        $order = PreSaleOrder::create([
            'code' => 'PREV-'.uniqid(), 'store_id' => $this->store->id, 'user_id' => $this->cashier->id,
            'customer_id' => $this->customer->id, 'status' => PreSaleOrder::STATUS_READY,
        ]);
        $item = $order->items()->create([
            'pre_sale_catalog_id' => $catalog->id, 'quantity' => 1, 'price_level' => 1,
            'unit_price' => 1000, 'cost' => 600, 'status' => PreSaleOrderItem::STATUS_PENDING,
        ]);
        $order->payments()->create([
            'amount' => 200, 'payment_method_id' => $this->cash->id,
            'cashier_id' => $this->cashier->id, 'notes' => 'Anticipo inicial',
        ]);

        return [$order, $item];
    }

    /** @param array<string, mixed> $body */
    private function deliver(PreSaleOrder $order, PreSaleOrderItem $item, array $body): TestResponse
    {
        return $this->actingAs($this->cashier)->patchJson("/api/v1/pre-sale-orders/{$order->id}/status", [
            'status' => 'delivered', 'item_ids' => [$item->id],
        ] + $body);
    }

    private function rollback(PreSaleOrder $order): TestResponse
    {
        return $this->actingAs($this->cashier)->postJson("/api/v1/pre-sale-orders/{$order->id}/cancel", [
            'mode' => 'liquidation_rollback', 'reason_code' => 'error_cajero',
            'cash_session_id' => $this->session->id,
        ]);
    }

    // ── Anticipo ──────────────────────────────────────────────────────────────

    public function test_anticipo_con_tarjeta_guarda_terminal_y_comision(): void
    {
        $res = $this->createOrder($this->makeCatalog(1000, false), [
            'payments' => [['amount' => 400, 'payment_method_id' => $this->card->id, 'terminal_id' => $this->terminal->id]],
        ]);

        $res->assertOk();
        $payment = PreSaleOrderPayment::sole();
        $this->assertSame(400.0, $payment->amount);
        $this->assertSame($this->card->id, $payment->payment_method_id);
        $this->assertSame($this->terminal->id, $payment->terminal_id);
        $this->assertSame(14.0, $payment->commission_amount); // 3.5% de $400
        $this->assertSame('Anticipo inicial', $payment->notes);
    }

    public function test_anticipo_mixto_deja_dos_pagos_que_suman(): void
    {
        $res = $this->createOrder($this->makeCatalog(1000, false), [
            'payments' => [
                ['amount' => 150, 'payment_method_id' => $this->cash->id],
                ['amount' => 250, 'payment_method_id' => $this->transfer->id],
            ],
        ]);

        $res->assertOk();
        $this->assertSame(2, PreSaleOrderPayment::count());
        $this->assertSame(400.0, (float) PreSaleOrderPayment::sum('amount'));
        $this->assertSame(400.0, (float) $res->json('data.paid_amount'));
    }

    public function test_mixto_con_tarjeta_se_rechaza(): void
    {
        $res = $this->createOrder($this->makeCatalog(1000, false), [
            'payments' => [
                ['amount' => 150, 'payment_method_id' => $this->cash->id],
                ['amount' => 250, 'payment_method_id' => $this->card->id, 'terminal_id' => $this->terminal->id],
            ],
        ]);

        $res->assertStatus(422);
        $this->assertSame(0, PreSaleOrder::count());
    }

    public function test_terminal_sin_tarjeta_se_rechaza(): void
    {
        $this->createOrder($this->makeCatalog(1000, false), [
            'payments' => [['amount' => 400, 'payment_method_id' => $this->cash->id, 'terminal_id' => $this->terminal->id]],
        ])->assertStatus(422);
    }

    public function test_mas_de_dos_pagos_se_rechaza(): void
    {
        $this->createOrder($this->makeCatalog(1000, false), [
            'payments' => [
                ['amount' => 100, 'payment_method_id' => $this->cash->id],
                ['amount' => 100, 'payment_method_id' => $this->transfer->id],
                ['amount' => 100, 'payment_method_id' => $this->cash->id],
            ],
        ])->assertStatus(422);
    }

    public function test_anticipo_con_campos_de_siempre_sigue_igual(): void
    {
        $this->createOrder($this->makeCatalog(1000, false), [
            'advance_amount' => 300, 'payment_method_id' => $this->cash->id,
        ])->assertOk();

        $payment = PreSaleOrderPayment::sole();
        $this->assertSame(300.0, $payment->amount);
        $this->assertNull($payment->terminal_id);
        $this->assertSame(0.0, $payment->commission_amount);
    }

    // ── Liquidación ───────────────────────────────────────────────────────────

    public function test_liquidacion_con_tarjeta_guarda_terminal_comision_y_entrega(): void
    {
        [$order, $item] = $this->readyOrder();

        $this->deliver($order, $item, [
            'payments' => [['amount' => 800, 'payment_method_id' => $this->card->id, 'terminal_id' => $this->terminal->id]],
        ])->assertOk();

        $delivery = PreSaleDelivery::sole();
        $payment = PreSaleOrderPayment::where('notes', 'Liquidación')->sole();
        $this->assertSame($delivery->payment_id, $payment->id);
        $this->assertSame($delivery->id, $payment->delivery_id);
        $this->assertSame(28.0, $payment->commission_amount);
        $this->assertSame(PreSaleOrder::STATUS_DELIVERED, $order->fresh()->status);
    }

    public function test_liquidacion_mixta_y_revertir_quita_los_dos_pagos_y_saca_solo_el_efectivo(): void
    {
        [$order, $item] = $this->readyOrder();

        $this->deliver($order, $item, [
            'payments' => [
                ['amount' => 500, 'payment_method_id' => $this->cash->id],
                ['amount' => 300, 'payment_method_id' => $this->transfer->id],
            ],
        ])->assertOk();

        $delivery = PreSaleDelivery::sole();
        $this->assertSame(800.0, (float) $delivery->amount);
        $this->assertSame(2, PreSaleOrderPayment::where('delivery_id', $delivery->id)->count());

        $this->rollback($order)->assertOk();

        // El anticipo se queda; los dos pagos de la entrega se van.
        $this->assertSame(['Anticipo inicial'], PreSaleOrderPayment::pluck('notes')->all());
        $this->assertSame(PreSaleOrderItem::STATUS_PENDING, $item->fresh()->status);
        $refund = CashMovement::where('type', 'salida')->sole();
        $this->assertSame(500.0, (float) $refund->amount);
    }

    public function test_liquidacion_con_campos_de_siempre_sigue_igual(): void
    {
        [$order, $item] = $this->readyOrder();

        $this->deliver($order, $item, [
            'payment' => ['amount' => 800, 'payment_method_id' => $this->cash->id],
        ])->assertOk();

        $payment = PreSaleOrderPayment::where('notes', 'Liquidación')->sole();
        $this->assertSame(PreSaleDelivery::sole()->id, $payment->delivery_id);
        $this->assertNull($payment->terminal_id);
    }

    public function test_payment_y_payments_que_no_cuadran_se_rechazan(): void
    {
        [$order, $item] = $this->readyOrder();

        $this->deliver($order, $item, [
            'payment' => ['amount' => 800, 'payment_method_id' => $this->cash->id],
            'payments' => [['amount' => 700, 'payment_method_id' => $this->cash->id]],
        ])->assertStatus(422);

        $this->assertSame(PreSaleOrderItem::STATUS_PENDING, $item->fresh()->status);
    }

    public function test_entrega_con_tarjeta_no_se_revierte(): void
    {
        [$order, $item] = $this->readyOrder();

        $this->deliver($order, $item, [
            'payments' => [['amount' => 800, 'payment_method_id' => $this->card->id, 'terminal_id' => $this->terminal->id]],
        ])->assertOk();

        $this->rollback($order)->assertStatus(422);
        $this->assertSame(PreSaleOrderItem::STATUS_DELIVERED, $item->fresh()->status);
    }

    // ── Cobro mixto de Caja (POST /sales/mixed) ──────────────────────────────

    public function test_cobro_mixto_de_caja_pasa_los_pagos_al_folio_y_a_la_preventa_nueva(): void
    {
        [$order, $item] = $this->readyOrder();
        $nuevo = $this->makeCatalog(600, false);

        $res = $this->actingAs($this->cashier)->postJson('/api/v1/sales/mixed', [
            'store_id' => $this->store->id,
            'register_session_id' => $this->session->id,
            'customer_id' => $this->customer->id,
            'liquidation' => [
                'pre_sale_order_id' => $order->id,
                'item_ids' => [$item->id],
                'payments' => [
                    ['amount' => 500, 'payment_method_id' => $this->cash->id],
                    ['amount' => 300, 'payment_method_id' => $this->transfer->id],
                ],
            ],
            'new_order' => [
                'items' => [['catalog_id' => $nuevo->id, 'quantity' => 1, 'price_level' => 1]],
                'payments' => [['amount' => 200, 'payment_method_id' => $this->card->id, 'terminal_id' => $this->terminal->id]],
            ],
        ]);

        $res->assertStatus(201);
        $delivery = PreSaleDelivery::sole();
        $this->assertSame(2, PreSaleOrderPayment::where('delivery_id', $delivery->id)->count());
        $nuevoFolio = PreSaleOrder::where('id', '!=', $order->id)->sole();
        $anticipo = PreSaleOrderPayment::where('pre_sale_order_id', $nuevoFolio->id)->sole();
        $this->assertSame(200.0, $anticipo->amount);
        $this->assertSame(7.0, $anticipo->commission_amount);
    }
}
