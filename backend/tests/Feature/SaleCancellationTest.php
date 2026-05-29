<?php

namespace Tests\Feature;

use App\Models\CashRegister;
use App\Models\CashRegisterSession;
use App\Models\Company;
use App\Models\Customer;
use App\Models\Inventory;
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
 * ADR-016 — Sistema de cancelación de ventas y preventas.
 *
 * Invariantes:
 *  - Stock cancelado entra al inventario.
 *  - Dinero reversado crea cash_movement type='salida'.
 *  - Snapshot inmutable preserva cost_at_sale (ADR-015).
 *  - sale.status/cancellation_status reflejan el cambio.
 *  - Liquidation rollback: preventa delivered → ready, items vuelven a pending.
 */
class SaleCancellationTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;
    private Store $store;
    private Warehouse $warehouse;
    private User $admin;
    private CashRegisterSession $session;
    private PaymentMethod $cashMethod;
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

        $register = CashRegister::create([
            'store_id'   => $this->store->id,
            'name'       => 'Caja 1',
            'active'     => true,
        ]);
        $this->session = CashRegisterSession::create([
            'register_id'   => $register->id,
            'user_id'       => $this->admin->id,
            'opening_cash'  => 0,
            'opened_at'     => now(),
            'status'        => 'open',
        ]);

        $this->cashMethod = PaymentMethod::create([
            'name'        => 'Efectivo',
            'allow_cash'  => true,
            'allow_card'  => false,
            'active'      => true,
        ]);

        $this->service = new SaleCancellationService();
    }

    // ────────────────────────────── helpers ──────────────────────────────────

    private function makeProduct(float $cost = 50.0): Product
    {
        return Product::create([
            'name'         => 'Naruto Vol. 1',
            'sku'          => 'NARU-1',
            'cost'         => $cost,
            'active'       => true,
            'product_type' => Product::TYPE_PRODUCT,
        ]);
    }

    private function makeSale(Product $product, float $qty = 2, float $price = 150.0): Sale
    {
        Inventory::create(['product_id' => $product->id, 'warehouse_id' => $this->warehouse->id, 'quantity' => 10]);

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
            'cost'       => $product->cost, // ADR-015 snapshot
        ]);
        return $sale;
    }

    // ────────────────────────────── tests ────────────────────────────────────

    public function test_full_cancel_marks_returned_and_restores_stock_and_creates_cash_salida(): void
    {
        $product = $this->makeProduct(cost: 60.0);
        $sale    = $this->makeSale($product, qty: 2, price: 150.0);

        $stockBefore = (float) Inventory::where('product_id', $product->id)->value('quantity');

        $cancellation = $this->service->cancelSale(
            sale: $sale,
            itemsToCancel: [],
            reasonCode: SaleCancellation::REASON_CLIENTE_DEVUELVE,
            reasonText: 'cliente cambió de opinión',
            cancelledBy: $this->admin,
            activeSessionId: $this->session->id,
        );

        $sale->refresh();
        $this->assertSame(Sale::STATUS_RETURNED, $sale->status);
        $this->assertSame(Sale::CANCELLATION_FULL, $sale->cancellation_status);
        $this->assertEquals(0, $sale->items()->count(), 'items se borran cuando cancelas todo');

        // Stock restaurado
        $stockAfter = (float) Inventory::where('product_id', $product->id)->value('quantity');
        $this->assertEquals($stockBefore + 2, $stockAfter, 'inventory +2');

        // Cash movement salida creado
        $this->assertNotNull($cancellation->cash_movement_id);
        $cm = DB::table('cash_movements')->where('id', $cancellation->cash_movement_id)->first();
        $this->assertSame('salida', $cm->type);
        $this->assertEquals(300.0, (float) $cm->amount);
    }

    public function test_partial_cancel_keeps_sale_active_and_decrements_qty(): void
    {
        $product = $this->makeProduct();
        $sale    = $this->makeSale($product, qty: 3, price: 100.0); // total 300

        $itemId = $sale->items->first()->id;

        $this->service->cancelSale(
            sale: $sale,
            itemsToCancel: [['sale_item_id' => $itemId, 'quantity' => 1]],
            reasonCode: SaleCancellation::REASON_DANADO,
            reasonText: null,
            cancelledBy: $this->admin,
            activeSessionId: $this->session->id,
        );

        $sale->refresh()->load('items');
        $this->assertSame(Sale::STATUS_COMPLETED, $sale->status, 'sale sigue completada');
        $this->assertSame(Sale::CANCELLATION_PARTIAL, $sale->cancellation_status);
        $this->assertEquals(2, (float) $sale->items->first()->quantity, 'qty 3 → 2');
        $this->assertEquals(200.0, (float) $sale->total, 'total recalculado 200');
    }

    public function test_snapshot_preserves_cost_at_sale_for_gross_profit_recalc(): void
    {
        $product = $this->makeProduct(cost: 80.0);
        $sale    = $this->makeSale($product, qty: 1, price: 200.0);

        $cancellation = $this->service->cancelSale(
            $sale, [], SaleCancellation::REASON_ERROR_CAJERO, null, $this->admin, $this->session->id,
        );

        $snap = $cancellation->items_snapshot;
        $this->assertCount(1, $snap);
        $this->assertEquals(80.0, $snap[0]['cost'], 'cost_at_sale preservado en snapshot');
        $this->assertEquals(200.0, $snap[0]['price']);
        $this->assertEquals(1, $snap[0]['qty_cancelled']);
    }

    public function test_cannot_cancel_already_fully_cancelled_sale(): void
    {
        $product = $this->makeProduct();
        $sale    = $this->makeSale($product);
        $this->service->cancelSale($sale, [], SaleCancellation::REASON_OTRO, null, $this->admin, $this->session->id);

        $this->expectException(\DomainException::class);
        $this->service->cancelSale($sale->refresh(), [], SaleCancellation::REASON_OTRO, null, $this->admin, $this->session->id);
    }

    public function test_liquidation_rollback_reverts_delivered_to_ready_and_returns_stock(): void
    {
        $product = $this->makeProduct(cost: 70.0);
        Inventory::create(['product_id' => $product->id, 'warehouse_id' => $this->warehouse->id, 'quantity' => 10]);

        // Crear catálogo + preventa entregada con item delivered y 2 payments (anticipo + liquidación)
        $customer = Customer::create(['name' => 'Cliente Test']);
        $catalog  = PreSaleCatalog::create([
            'product_name'   => 'Naruto Special',
            'product_id'     => $product->id,
            'price_1'        => 200,
            'status'         => PreSaleCatalog::STATUS_PUBLISHED,
            'created_by'     => $this->admin->id,
            'preorder_limit' => 5,
        ]);
        $catalog->storeLimits()->create(['store_id' => $this->store->id, 'limit_qty' => 5]);

        $order = PreSaleOrder::create([
            'code'        => 'PREV-TEST',
            'store_id'    => $this->store->id,
            'user_id'     => $this->admin->id,
            'customer_id' => $customer->id,
            'status'      => PreSaleOrder::STATUS_DELIVERED,
        ]);
        $order->items()->create([
            'pre_sale_catalog_id' => $catalog->id,
            'product_id'          => $product->id,
            'quantity'            => 2,
            'price_level'         => 1,
            'unit_price'          => 200.0,
            'cost'                => 70.0,
            'status'              => 'delivered',
            'delivered_at'        => now(),
        ]);
        // Anticipo + liquidación
        $order->payments()->create(['amount' => 100.0, 'payment_method_id' => $this->cashMethod->id, 'cashier_id' => $this->admin->id]);
        $order->payments()->create(['amount' => 300.0, 'payment_method_id' => $this->cashMethod->id, 'cashier_id' => $this->admin->id]);

        $stockBefore = (float) Inventory::where('product_id', $product->id)->value('quantity');

        $cancellation = $this->service->cancelPreSaleOrder(
            order: $order,
            mode: SaleCancellation::MODE_LIQUIDATION_ROLLBACK,
            reasonCode: SaleCancellation::REASON_ERROR_CAJERO,
            reasonText: null,
            cancelledBy: $this->admin,
            activeSessionId: $this->session->id,
        );

        $order->refresh()->load(['items', 'payments']);
        $this->assertSame(PreSaleOrder::STATUS_READY, $order->status, 'delivered → ready');
        $this->assertCount(1, $order->payments, 'solo queda el anticipo (liquidación borrada)');
        $this->assertEquals(100.0, (float) $order->payments->first()->amount);

        // Item ya no entregado
        $item = $order->items->first();
        $this->assertNull($item->delivered_at);
        $this->assertSame('pending', $item->status);

        // Stock restaurado (+ qty=2)
        $stockAfter = (float) Inventory::where('product_id', $product->id)->value('quantity');
        $this->assertEquals($stockBefore + 2, $stockAfter, 'inventory +2 por items reversados');

        // Reverso solo del payment de liquidación (300)
        $this->assertEquals(300.0, (float) $cancellation->amount_refunded);
    }

    public function test_full_pre_sale_cancel_cancels_order_and_reverses_all_payments(): void
    {
        $product = $this->makeProduct();
        Inventory::create(['product_id' => $product->id, 'warehouse_id' => $this->warehouse->id, 'quantity' => 10]);

        $customer = Customer::create(['name' => 'Otro']);
        $catalog  = PreSaleCatalog::create([
            'product_name'   => 'Test',
            'product_id'     => $product->id,
            'price_1'        => 200,
            'status'         => PreSaleCatalog::STATUS_PUBLISHED,
            'created_by'     => $this->admin->id,
            'preorder_limit' => 5,
        ]);
        $catalog->storeLimits()->create(['store_id' => $this->store->id, 'limit_qty' => 5]);

        $order = PreSaleOrder::create([
            'code'        => 'PREV-FULL',
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
        $order->payments()->create(['amount' => 100.0, 'payment_method_id' => $this->cashMethod->id, 'cashier_id' => $this->admin->id]);

        $cancellation = $this->service->cancelPreSaleOrder(
            $order, SaleCancellation::MODE_FULL, SaleCancellation::REASON_NO_LLEGO, null, $this->admin, $this->session->id,
        );

        $order->refresh();
        $this->assertSame(PreSaleOrder::STATUS_CANCELLED, $order->status);
        $this->assertSame(PreSaleOrder::CANCELLATION_FULL, $order->cancellation_status);
        $this->assertEquals(0, $order->payments()->count(), 'todos los payments reversados');
        $this->assertEquals(100.0, (float) $cancellation->amount_refunded);
    }
}
