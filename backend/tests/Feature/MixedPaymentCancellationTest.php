<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\CashRegister;
use App\Models\CashRegisterSession;
use App\Models\Company;
use App\Models\Customer;
use App\Models\Inventory;
use App\Models\Payment;
use App\Models\PaymentMethod;
use App\Models\PreSaleCatalog;
use App\Models\PreSaleOrder;
use App\Models\Product;
use App\Models\Sale;
use App\Models\SaleCancellation;
use App\Models\SaleItem;
use App\Models\Store;
use App\Models\User;
use App\Models\Warehouse;
use App\Services\SaleCancellationService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Pago mixto Efectivo + Transferencia (Joel 2026-08-05).
 *
 * Invariantes:
 *  - El checkout ya acepta N pagos (payments 1:N) y el corte suma por renglón
 *    con cashLikeSqlCondition → solo la porción efectivo entra al esperado.
 *  - El reverso de una cancelación SOLO saca del cajón la porción cash-like:
 *    lo transferido nunca entró al cajón y se reversa por el banco. Antes de
 *    este fix la salida era por el 100% → corte corto.
 */
class MixedPaymentCancellationTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;
    private Store $store;
    private Warehouse $warehouse;
    private User $admin;
    private CashRegisterSession $session;
    private PaymentMethod $cash;
    private PaymentMethod $transfer;
    private SaleCancellationService $service;

    protected function setUp(): void
    {
        parent::setUp();

        $this->company   = Company::create(['name' => 'Test Co']);
        $this->store     = Store::create(['company_id' => $this->company->id, 'name' => 'Store 1']);
        $this->warehouse = Warehouse::create([
            'company_id' => $this->company->id,
            'store_id'   => $this->store->id,
            'name'       => 'WH 1',
            'type'       => 'store',
            'active'     => true,
        ]);
        $this->admin = User::create([
            'name'       => 'Admin',
            'email'      => 'admin@test.com',
            'password'   => bcrypt('x'),
            'company_id' => $this->company->id,
            'store_id'   => $this->store->id,
        ]);
        $roleId = DB::table('roles')->where('name', 'admin')->value('id')
            ?? DB::table('roles')->insertGetId(['name' => 'admin', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('model_has_roles')->insert([
            'role_id' => $roleId, 'model_type' => User::class, 'model_id' => $this->admin->id,
        ]);

        $register = CashRegister::create(['store_id' => $this->store->id, 'name' => 'Caja 1', 'active' => true]);
        $this->session = CashRegisterSession::create([
            'register_id'  => $register->id,
            'user_id'      => $this->admin->id,
            'opening_cash' => 0,
            'opened_at'    => now()->subHour(),
            'status'       => 'open',
        ]);

        $this->cash     = PaymentMethod::create(['name' => 'Efectivo', 'active' => true]);
        $this->transfer = PaymentMethod::create(['name' => 'Transferencia', 'active' => true]);

        $this->service = new SaleCancellationService();
    }

    // ────────────────────────────── helpers ──────────────────────────────────

    /** Venta con pagos explícitos: [[method, amount], ...]. */
    private function makeSaleWithPayments(array $paymentRows, float $qty = 5, float $price = 100.0): Sale
    {
        $product = Product::create([
            'name'         => 'Producto Mixto',
            'sku'          => 'MIX-' . uniqid(),
            'cost'         => 40.0,
            'active'       => true,
            'product_type' => Product::TYPE_PRODUCT,
        ]);
        Inventory::create(['product_id' => $product->id, 'warehouse_id' => $this->warehouse->id, 'quantity' => 20]);

        $sale = Sale::create([
            'store_id'            => $this->store->id,
            'register_session_id' => $this->session->id,
            'user_id'             => $this->admin->id,
            'subtotal'            => $qty * $price,
            'discount'            => 0,
            'total'               => $qty * $price,
            'status'              => Sale::STATUS_COMPLETED,
        ]);
        SaleItem::create([
            'sale_id'    => $sale->id,
            'product_id' => $product->id,
            'quantity'   => $qty,
            'price'      => $price,
            'total'      => $qty * $price,
            'cost'       => 40.0,
        ]);
        foreach ($paymentRows as [$method, $amount]) {
            Payment::create(['sale_id' => $sale->id, 'payment_method_id' => $method->id, 'amount' => $amount]);
        }

        return $sale;
    }

    private function cashMovementAmount(SaleCancellation $cancellation): ?float
    {
        if ($cancellation->cash_movement_id === null) return null;

        return (float) DB::table('cash_movements')->where('id', $cancellation->cash_movement_id)->value('amount');
    }

    // ────────────────────────────── cancelación ──────────────────────────────

    public function test_cancelacion_total_de_venta_mixta_solo_saca_la_porcion_efectivo(): void
    {
        // $500 = $300 efectivo + $200 transferencia
        $sale = $this->makeSaleWithPayments([[$this->cash, 300.0], [$this->transfer, 200.0]]);

        $cancellation = $this->service->cancelSale(
            sale: $sale,
            itemsToCancel: [],
            reasonCode: SaleCancellation::REASON_CLIENTE_DEVUELVE,
            reasonText: null,
            cancelledBy: $this->admin,
            activeSessionId: $this->session->id,
        );

        $this->assertEquals(500.0, (float) $cancellation->amount_refunded, 'el log guarda el total reversado');
        $this->assertEquals(300.0, $this->cashMovementAmount($cancellation), 'del cajón solo sale la porción efectivo');
    }

    public function test_cancelacion_de_venta_pura_transferencia_no_toca_el_cajon(): void
    {
        $sale = $this->makeSaleWithPayments([[$this->transfer, 500.0]]);

        $cancellation = $this->service->cancelSale(
            $sale, [], SaleCancellation::REASON_CLIENTE_DEVUELVE, null, $this->admin, $this->session->id,
        );

        $this->assertEquals(500.0, (float) $cancellation->amount_refunded);
        $this->assertNull($cancellation->cash_movement_id, 'transferencia nunca entró al cajón — no hay salida');
    }

    public function test_cancelacion_parcial_de_venta_mixta_prorratea_la_salida(): void
    {
        // Ratio efectivo 300/500 = 0.6 → cancelar $100 de mercancía saca $60.
        $sale   = $this->makeSaleWithPayments([[$this->cash, 300.0], [$this->transfer, 200.0]]);
        $itemId = $sale->items()->first()->id;

        $cancellation = $this->service->cancelSale(
            sale: $sale,
            itemsToCancel: [['sale_item_id' => $itemId, 'quantity' => 1]], // 1 × $100
            reasonCode: SaleCancellation::REASON_DANADO,
            reasonText: null,
            cancelledBy: $this->admin,
            activeSessionId: $this->session->id,
        );

        $this->assertEquals(100.0, (float) $cancellation->amount_refunded);
        $this->assertEquals(60.0, $this->cashMovementAmount($cancellation));
    }

    public function test_cancelacion_de_venta_solo_efectivo_sigue_igual(): void
    {
        // Regresión: mono-método efectivo conserva el comportamiento histórico.
        $sale = $this->makeSaleWithPayments([[$this->cash, 500.0]]);

        $cancellation = $this->service->cancelSale(
            $sale, [], SaleCancellation::REASON_OTRO, null, $this->admin, $this->session->id,
        );

        $this->assertEquals(500.0, $this->cashMovementAmount($cancellation));
    }

    public function test_cancelacion_preventa_con_anticipo_por_transferencia_solo_reversa_efectivo(): void
    {
        $product = Product::create([
            'name' => 'Preventa Mixta', 'sku' => 'PREV-MIX', 'active' => true,
            'product_type' => Product::TYPE_PRODUCT,
        ]);
        Inventory::create(['product_id' => $product->id, 'warehouse_id' => $this->warehouse->id, 'quantity' => 10]);

        $customer = Customer::create(['name' => 'Cliente Mixto']);
        $catalog  = PreSaleCatalog::create([
            'product_name'   => 'Preventa Mixta',
            'product_id'     => $product->id,
            'price_1'        => 200,
            'status'         => PreSaleCatalog::STATUS_PUBLISHED,
            'created_by'     => $this->admin->id,
            'preorder_limit' => 5,
        ]);
        $catalog->storeLimits()->create(['store_id' => $this->store->id, 'limit_qty' => 5]);

        $order = PreSaleOrder::create([
            'code'        => 'PREV-MIX-1',
            'store_id'    => $this->store->id,
            'user_id'     => $this->admin->id,
            'customer_id' => $customer->id,
            'status'      => PreSaleOrder::STATUS_READY,
        ]);
        $order->items()->create([
            'pre_sale_catalog_id' => $catalog->id,
            'product_id'          => $product->id,
            'quantity'            => 1,
            'price_level'         => 1,
            'unit_price'          => 200.0,
            'status'              => 'pending',
        ]);
        // Anticipo en efectivo + abono por transferencia
        $order->payments()->create(['amount' => 100.0, 'payment_method_id' => $this->cash->id, 'cashier_id' => $this->admin->id]);
        $order->payments()->create(['amount' => 50.0, 'payment_method_id' => $this->transfer->id, 'cashier_id' => $this->admin->id]);

        $cancellation = $this->service->cancelPreSaleOrder(
            $order, SaleCancellation::MODE_FULL, SaleCancellation::REASON_NO_LLEGO, null, $this->admin, $this->session->id,
        );

        $this->assertEquals(150.0, (float) $cancellation->amount_refunded);
        $this->assertEquals(100.0, $this->cashMovementAmount($cancellation), 'solo el anticipo en efectivo sale del cajón');
    }

    // ────────────────────────────── checkout + corte ─────────────────────────

    public function test_checkout_mixto_persiste_dos_pagos_y_el_corte_solo_cuenta_efectivo(): void
    {
        $product = Product::create([
            'company_id'   => $this->company->id,
            'name'         => 'Checkout Mixto',
            'sku'          => 'CHK-MIX',
            'active'       => true,
            'product_type' => Product::TYPE_PRODUCT,
        ]);
        $product->price()->create(['price_1' => 100.0]);
        $product->paymentMethod()->create(['allow_cash' => true, 'allow_card' => true]);
        Inventory::create(['product_id' => $product->id, 'warehouse_id' => $this->warehouse->id, 'quantity' => 10]);

        $this->actingAs($this->admin)
            ->postJson('/api/v1/sales', [
                'store_id'            => $this->store->id,
                'register_session_id' => $this->session->id,
                'items'               => [['product_id' => $product->id, 'quantity' => 5, 'price' => 100.0]],
                'payments'            => [
                    ['payment_method_id' => $this->cash->id, 'amount' => 300.0],
                    ['payment_method_id' => $this->transfer->id, 'amount' => 200.0],
                ],
                'cash_received'       => 300.0,
                'change_amount'       => 0.0,
            ])
            ->assertCreated();

        $sale = Sale::latest('id')->first();
        $this->assertEquals(2, $sale->payments()->count(), 'los dos renglones de pago persisten');

        // El corte solo espera la porción efectivo ($300), no el total ($500).
        $row = collect(
            $this->actingAs($this->admin)
                ->getJson('/api/v1/reports/cash?from=' . now()->subDay()->toDateString() . '&to=' . now()->addDay()->toDateString())
                ->assertOk()
                ->json('data.sessions')
        )->firstWhere('id', $this->session->id);

        $this->assertNotNull($row);
        $this->assertEquals(300.0, (float) $row['expected_cash'], 'opening 0 + solo la porción efectivo');
    }
}
