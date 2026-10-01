<?php

namespace Tests\Feature;

use App\Models\CashRegister;
use App\Models\CashRegisterSession;
use App\Models\Company;
use App\Models\Inventory;
use App\Models\PaymentMethod;
use App\Models\Product;
use App\Models\Store;
use App\Models\User;
use App\Models\Warehouse;
use App\Services\CheckoutService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * QA crítico 2026-06-08: un producto solo-efectivo (allow_card=false) se podía
 * cobrar con tarjeta — el backend no validaba las restricciones de pago por
 * producto (product_payment_methods). Guard nuevo:
 * CheckoutService::assertPaymentMethodsAllowed.
 */
class PaymentRestrictionTest extends TestCase
{
    use RefreshDatabase;

    private User $user;
    private Store $store;
    private Warehouse $warehouse;
    private CashRegisterSession $session;
    private PaymentMethod $cash;
    private PaymentMethod $card;

    protected function setUp(): void
    {
        parent::setUp();

        $company = Company::create(['name' => 'Test Co']);
        $this->store = Store::create(['company_id' => $company->id, 'name' => 'Test Store']);
        $this->user = User::create([
            'name' => 'Cajero', 'email' => 'cajero@test.com', 'password' => bcrypt('x'),
            'company_id' => $company->id, 'store_id' => $this->store->id,
        ]);
        $this->warehouse = Warehouse::create([
            'company_id' => $company->id, 'store_id' => $this->store->id,
            'name' => 'Bodega', 'type' => 'store', 'active' => true,
        ]);
        $register = CashRegister::create([
            'store_id' => $this->store->id, 'name' => 'Caja 1', 'active' => true,
        ]);
        $this->session = CashRegisterSession::create([
            'register_id' => $register->id, 'user_id' => $this->user->id,
            'opening_cash' => 0, 'status' => 'open', 'opened_at' => now(),
        ]);
        $this->cash = PaymentMethod::create(['name' => 'Efectivo', 'active' => true]);
        $this->card = PaymentMethod::create(['name' => 'Tarjeta Crédito', 'active' => true]);
    }

    private function makeProduct(bool $allowCash, bool $allowCard): Product
    {
        $product = Product::create([
            'company_id' => $this->store->company_id,
            'name'       => 'Producto ' . uniqid(),
            'sku'        => 'SKU-' . uniqid(),
            'active'     => true,
        ]);
        $product->price()->create(['price_1' => 100.0]);
        $product->paymentMethod()->create(['allow_cash' => $allowCash, 'allow_card' => $allowCard]);
        Inventory::create([
            'product_id' => $product->id, 'warehouse_id' => $this->warehouse->id, 'quantity' => 10,
        ]);

        return $product;
    }

    private function checkoutPayload(Product $product, PaymentMethod $method): array
    {
        return [
            'store_id'            => $this->store->id,
            'register_session_id' => $this->session->id,
            'items'               => [['product_id' => $product->id, 'quantity' => 1, 'price' => 100.0]],
            'payments'            => [['payment_method_id' => $method->id, 'amount' => 100.0]],
        ];
    }

    public function test_cash_only_product_cannot_be_paid_with_card(): void
    {
        $product = $this->makeProduct(allowCash: true, allowCard: false);

        $this->actingAs($this->user)
            ->postJson('/api/v1/sales', $this->checkoutPayload($product, $this->card))
            ->assertStatus(422)
            ->assertJsonFragment(['success' => false]);

        $this->assertDatabaseCount('sales', 0);
        // El stock no se tocó
        $this->assertSame(10.0, (float) Inventory::first()->quantity);
    }

    public function test_card_only_product_cannot_be_paid_with_cash(): void
    {
        $product = $this->makeProduct(allowCash: false, allowCard: true);

        $this->actingAs($this->user)
            ->postJson('/api/v1/sales', $this->checkoutPayload($product, $this->cash))
            ->assertStatus(422);

        $this->assertDatabaseCount('sales', 0);
    }

    public function test_cash_only_product_paid_with_cash_succeeds(): void
    {
        $product = $this->makeProduct(allowCash: true, allowCard: false);

        $this->actingAs($this->user)
            ->postJson('/api/v1/sales', $this->checkoutPayload($product, $this->cash))
            ->assertCreated();

        $this->assertDatabaseCount('sales', 1);
    }

    public function test_unrestricted_product_accepts_card(): void
    {
        $product = Product::create([
            'company_id' => $this->store->company_id,
            'name' => 'Sin restricción', 'sku' => 'SKU-FREE', 'active' => true,
        ]);
        $product->price()->create(['price_1' => 100.0]);
        Inventory::create([
            'product_id' => $product->id, 'warehouse_id' => $this->warehouse->id, 'quantity' => 10,
        ]);

        $this->actingAs($this->user)
            ->postJson('/api/v1/sales', $this->checkoutPayload($product, $this->card))
            ->assertCreated();
    }

    // ── Cancelaciones con tarjeta: permitidas desde 2026-09-30 (antes bloqueadas
    //    desde 2026-06-10). Regresa el stock, NO sale efectivo del cajón. ────────

    private function cardSale(Product $product, int $qty = 1): int
    {
        $payload = $this->checkoutPayload($product, $this->card);
        $payload['items'][0]['quantity']    = $qty;
        $payload['payments'][0]['amount']   = 100.0 * $qty;

        return (int) $this->actingAs($this->user)
            ->postJson('/api/v1/sales', $payload)
            ->assertCreated()
            ->json('data.id');
    }

    public function test_card_paid_sale_can_be_cancelled_without_cash_out(): void
    {
        $product = $this->makeProduct(allowCash: true, allowCard: true);
        $saleId  = $this->cardSale($product);

        $this->actingAs($this->user)
            ->postJson("/api/v1/sales/{$saleId}/cancel", [
                'reason_code'     => 'otro',
                'cash_session_id' => $this->session->id,
            ])
            ->assertOk();

        // Stock de regreso y venta cancelada…
        $this->assertSame(10.0, (float) Inventory::where('product_id', $product->id)->first()->quantity);
        $this->assertSame('returned', \App\Models\Sale::find($saleId)->status);
        // …pero del cajón no sale nada: la devolución va por la terminal.
        $this->assertDatabaseCount('cash_movements', 0);
        $this->assertNull(\App\Models\SaleCancellation::where('sale_id', $saleId)->first()->cash_movement_id);
        // El pago con tarjeta queda registrado tal cual (la comisión ya se pagó).
        $this->assertSame(100.0, (float) \App\Models\Payment::where('sale_id', $saleId)->sum('amount'));
    }

    public function test_card_paid_sale_partial_cancel_without_cash_out(): void
    {
        $product = $this->makeProduct(allowCash: true, allowCard: true);
        $saleId  = $this->cardSale($product, 2);
        $itemId  = \App\Models\SaleItem::where('sale_id', $saleId)->value('id');

        $this->actingAs($this->user)
            ->postJson("/api/v1/sales/{$saleId}/cancel", [
                'reason_code'     => 'otro',
                'cash_session_id' => $this->session->id,
                'items'           => [['sale_item_id' => $itemId, 'quantity' => 1]],
            ])
            ->assertOk();

        $this->assertSame(9.0, (float) Inventory::where('product_id', $product->id)->first()->quantity);
        $this->assertSame(100.0, (float) \App\Models\Sale::find($saleId)->total);
        $this->assertDatabaseCount('cash_movements', 0);
    }

    public function test_card_cancel_does_not_move_expected_cash(): void
    {
        $product = $this->makeProduct(allowCash: true, allowCard: true);
        $saleId  = $this->cardSale($product);

        $this->actingAs($this->user)
            ->postJson("/api/v1/sales/{$saleId}/cancel", [
                'reason_code'     => 'otro',
                'cash_session_id' => $this->session->id,
            ])
            ->assertOk();

        $range = 'from=' . now()->subDay()->toDateString() . '&to=' . now()->addDay()->toDateString();
        $row = collect($this->actingAs($this->user)->getJson("/api/v1/reports/cash?{$range}")->assertOk()->json('data.sessions'))
            ->firstWhere('id', $this->session->id);
        $this->assertNotNull($row);
        $this->assertEquals(0.0, (float) $row['expected_cash']);
    }

    public function test_cash_paid_sale_can_still_be_cancelled(): void
    {
        $product = $this->makeProduct(allowCash: true, allowCard: true);

        $saleId = $this->actingAs($this->user)
            ->postJson('/api/v1/sales', $this->checkoutPayload($product, $this->cash))
            ->assertCreated()
            ->json('data.id');

        $this->actingAs($this->user)
            ->postJson("/api/v1/sales/{$saleId}/cancel", [
                'reason_code'     => 'otro',
                'cash_session_id' => $this->session->id,
            ])
            ->assertOk();

        // Stock restaurado
        $this->assertSame(10.0, (float) Inventory::where('product_id', $product->id)->first()->quantity);
    }

    // El /return viejo (sin uso en la UI) sigue bloqueando tarjeta.
    public function test_card_paid_sale_cannot_be_returned(): void
    {
        $product = $this->makeProduct(allowCash: true, allowCard: true);

        $saleId = $this->actingAs($this->user)
            ->postJson('/api/v1/sales', $this->checkoutPayload($product, $this->card))
            ->assertCreated()
            ->json('data.id');

        $this->actingAs($this->user)
            ->postJson("/api/v1/sales/{$saleId}/return")
            ->assertStatus(422);

        // Stock sigue descontado (no hubo devolución)
        $this->assertSame(9.0, (float) Inventory::where('product_id', $product->id)->first()->quantity);
    }

    public function test_presale_with_card_payment_cannot_be_cancelled(): void
    {
        $customer = \App\Models\Customer::create(['name' => 'Cliente Tarjeta']);
        $order = \App\Models\PreSaleOrder::create([
            'code'        => 'PREV-CARD-1',
            'store_id'    => $this->store->id,
            'customer_id' => $customer->id,
            'user_id'     => $this->user->id,
            'status'      => \App\Models\PreSaleOrder::STATUS_PENDING,
            'total'       => 150,
        ]);
        \App\Models\PreSaleOrderPayment::create([
            'pre_sale_order_id' => $order->id,
            'amount'            => 50,
            'payment_method_id' => $this->card->id,
            'cashier_id'        => $this->user->id,
        ]);

        $this->actingAs($this->user)
            ->postJson("/api/v1/pre-sale-orders/{$order->id}/cancel", [
                'mode' => 'full', 'reason_code' => 'otro',
            ])
            ->assertStatus(422);

        $this->assertSame(\App\Models\PreSaleOrder::STATUS_PENDING, $order->fresh()->status);
    }

    public function test_mixed_payment_with_card_rejected_when_item_is_cash_only(): void
    {
        $product = $this->makeProduct(allowCash: true, allowCard: false);

        $payload = [
            'store_id'            => $this->store->id,
            'register_session_id' => $this->session->id,
            'items'               => [['product_id' => $product->id, 'quantity' => 1, 'price' => 100.0]],
            'payments'            => [
                ['payment_method_id' => $this->cash->id, 'amount' => 50.0],
                ['payment_method_id' => $this->card->id, 'amount' => 50.0],
            ],
        ];

        $this->actingAs($this->user)
            ->postJson('/api/v1/sales', $payload)
            ->assertStatus(422);
    }
}
