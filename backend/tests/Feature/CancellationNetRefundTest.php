<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\CashRegister;
use App\Models\CashRegisterSession;
use App\Models\Company;
use App\Models\Inventory;
use App\Models\PaymentMethod;
use App\Models\Product;
use App\Models\ProductPromotion;
use App\Models\Sale;
use App\Models\SaleCancellation;
use App\Models\SaleItem;
use App\Models\Store;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Reembolso NETO al cancelar (bug encontrado 2026-09-29).
 *
 * Antes la cancelación devolvía `cantidad × precio` (bruto) aunque la línea
 * tuviera descuento → devolvía de más y el corte quedaba corto. Con aumentos
 * pasaría al revés. Ahora se devuelve exactamente lo que la venta deja de
 * cobrar: reembolso = total_antes − total_después, con descuento/aumento/promo
 * prorrateados por cantidad. Invariante: total final + Σ reembolsos = Σ pagos.
 */
class CancellationNetRefundTest extends TestCase
{
    use RefreshDatabase;

    private User $user;
    private Store $store;
    private CashRegisterSession $session;
    private PaymentMethod $cash;
    private PaymentMethod $transfer;

    protected function setUp(): void
    {
        parent::setUp();

        $company = Company::create(['name' => 'Test Co']);
        $this->store = Store::create(['company_id' => $company->id, 'name' => 'Test Store']);
        $this->user = User::create([
            'name' => 'Cajero', 'email' => 'cajero@test.com', 'password' => bcrypt('x'),
            'company_id' => $company->id, 'store_id' => $this->store->id,
        ]);
        Warehouse::create([
            'company_id' => $company->id, 'store_id' => $this->store->id,
            'name' => 'Exhibición', 'type' => 'store', 'active' => true,
        ]);
        $register = CashRegister::create(['store_id' => $this->store->id, 'name' => 'Caja 1', 'active' => true]);
        $this->session = CashRegisterSession::create([
            'register_id' => $register->id, 'user_id' => $this->user->id,
            'opening_cash' => 0, 'status' => 'open', 'opened_at' => now(),
        ]);
        $this->cash     = PaymentMethod::create(['name' => 'Efectivo', 'active' => true]);
        $this->transfer = PaymentMethod::create(['name' => 'Transferencia', 'active' => true]);
    }

    // ─── helpers ────────────────────────────────────────────────────────────

    private function makeProduct(float $price): Product
    {
        $warehouse = Warehouse::where('store_id', $this->store->id)->first();
        $product = Product::create([
            'company_id' => $this->store->company_id,
            'name' => 'Producto ' . uniqid(), 'sku' => 'SKU-' . uniqid(),
            'cost' => 40, 'active' => true,
        ]);
        $product->price()->create(['price_1' => $price]);
        Inventory::create(['product_id' => $product->id, 'warehouse_id' => $warehouse->id, 'quantity' => 100]);

        return $product;
    }

    /** Venta v2 real (checkout HTTP) — columnas por línea como en prod. */
    private function sell(array $items, float $total, ?array $payments = null): Sale
    {
        $resp = $this->actingAs($this->user)->postJson('/api/v1/sales', [
            'store_id'            => $this->store->id,
            'register_session_id' => $this->session->id,
            'calc_version'        => 2,
            'items'               => $items,
            'payments'            => $payments ?? [['payment_method_id' => $this->cash->id, 'amount' => $total]],
        ])->assertStatus(201);
        $this->assertEquals($total, (float) $resp->json('data.total'));

        return Sale::latest('id')->first();
    }

    /** Venta legacy (sin calc_version): descuento global, sin montos por línea. */
    private function sellLegacy(Product $product, float $qty, float $price, float $discount): Sale
    {
        $total = $qty * $price - $discount;
        $this->actingAs($this->user)->postJson('/api/v1/sales', [
            'store_id'            => $this->store->id,
            'register_session_id' => $this->session->id,
            'items'               => [['product_id' => $product->id, 'quantity' => $qty, 'price' => $price]],
            'payments'            => [['payment_method_id' => $this->cash->id, 'amount' => $total]],
            'discount'            => $discount,
        ])->assertStatus(201);

        return Sale::latest('id')->first();
    }

    private function cancel(Sale $sale, array $items = []): SaleCancellation
    {
        $this->actingAs($this->user)->postJson("/api/v1/sales/{$sale->id}/cancel", array_filter([
            'items'           => $items,
            'reason_code'     => 'cliente_devuelve',
            'cash_session_id' => $this->session->id,
        ]))->assertOk();

        return SaleCancellation::latest('id')->first();
    }

    private function cashOut(SaleCancellation $c): float
    {
        return (float) DB::table('cash_movements')->where('id', $c->cash_movement_id)->value('amount');
    }

    private function discount(float $value, string $reason = 'danado'): array
    {
        return ['kind' => 'fixed', 'basis' => 'unit', 'value' => $value, 'reason' => $reason];
    }

    private function surcharge(float $value, string $reason = 'precio_especial'): array
    {
        return ['kind' => 'fixed', 'basis' => 'unit', 'value' => $value, 'reason' => $reason];
    }

    // ─── descuento ──────────────────────────────────────────────────────────

    public function test_full_cancel_of_discounted_line_refunds_what_was_paid(): void
    {
        // 2 × $100 con −$20 c/u → se cobró $160. Antes devolvía $200.
        $p = $this->makeProduct(100);
        $sale = $this->sell([['product_id' => $p->id, 'quantity' => 2, 'price' => 100.0,
            'line_discount' => $this->discount(20)]], 160.0);

        $c = $this->cancel($sale);

        $this->assertEquals(160.0, (float) $c->amount_refunded);
        $this->assertEquals(160.0, $this->cashOut($c));
        $snap = $c->items_snapshot[0];
        $this->assertEquals(160.0, $snap['line_total']);
        $this->assertEquals(200.0, $snap['gross_total']);
        $this->assertEquals(40.0, $snap['discount_cancelled']);
        $this->assertEquals(0.0, $snap['surcharge_cancelled']);

        $sale->refresh();
        $this->assertSame(Sale::STATUS_RETURNED, $sale->status);
        $this->assertEquals(0.0, (float) $sale->total);
        $this->assertEquals(0.0, (float) $sale->discount);
    }

    public function test_partial_cancel_prorates_the_line_discount(): void
    {
        // 3 × $100 con −$20 c/u (desc $60, total $240); cancelo 1 → devuelvo $80.
        $p = $this->makeProduct(100);
        $sale = $this->sell([['product_id' => $p->id, 'quantity' => 3, 'price' => 100.0,
            'line_discount' => $this->discount(20)]], 240.0);
        $itemId = $sale->items()->value('id');

        $c = $this->cancel($sale, [['sale_item_id' => $itemId, 'quantity' => 1]]);

        $this->assertEquals(80.0, (float) $c->amount_refunded);
        $item = SaleItem::find($itemId);
        $this->assertEquals(2.0, (float) $item->quantity);
        $this->assertEquals(200.0, (float) $item->total);
        $this->assertEquals(40.0, (float) $item->discount_amount);

        $sale->refresh();
        $this->assertSame(Sale::CANCELLATION_PARTIAL, $sale->cancellation_status);
        $this->assertEquals(200.0, (float) $sale->subtotal);
        $this->assertEquals(40.0, (float) $sale->discount);
        $this->assertEquals(160.0, (float) $sale->total);
    }

    public function test_partial_cancel_prorates_the_promo(): void
    {
        // 2 × $50 con 2x1 → se cobró $50; cancelo 1 → devuelvo $25.
        $p = $this->makeProduct(50);
        ProductPromotion::create(['product_id' => $p->id, 'name' => '2x1', 'buy_n' => 2, 'pay_m' => 1]);
        $sale = $this->sell([['product_id' => $p->id, 'quantity' => 2, 'price' => 50.0]], 50.0);
        $itemId = $sale->items()->value('id');

        $c = $this->cancel($sale, [['sale_item_id' => $itemId, 'quantity' => 1]]);

        $this->assertEquals(25.0, (float) $c->amount_refunded);
        $item = SaleItem::find($itemId);
        $this->assertEquals(25.0, (float) $item->discount_amount);
        $this->assertEquals(25.0, (float) $item->promo_amount);
        $this->assertEquals(25.0, (float) $sale->refresh()->total);
    }

    // ─── aumento ────────────────────────────────────────────────────────────

    public function test_full_cancel_of_surcharged_line_refunds_the_surcharge_too(): void
    {
        $p = $this->makeProduct(100);
        $sale = $this->sell([['product_id' => $p->id, 'quantity' => 2, 'price' => 100.0,
            'line_surcharge' => $this->surcharge(50)]], 300.0);

        $c = $this->cancel($sale);

        $this->assertEquals(300.0, (float) $c->amount_refunded);
        $this->assertEquals(300.0, $this->cashOut($c));
        $this->assertEquals(100.0, $c->items_snapshot[0]['surcharge_cancelled']);
        $sale->refresh();
        $this->assertEquals(0.0, (float) $sale->total);
        $this->assertEquals(0.0, (float) $sale->surcharge);
    }

    public function test_partial_cancel_prorates_the_surcharge(): void
    {
        $p = $this->makeProduct(100);
        $sale = $this->sell([['product_id' => $p->id, 'quantity' => 2, 'price' => 100.0,
            'line_surcharge' => $this->surcharge(50)]], 300.0);
        $itemId = $sale->items()->value('id');

        $c = $this->cancel($sale, [['sale_item_id' => $itemId, 'quantity' => 1]]);

        $this->assertEquals(150.0, (float) $c->amount_refunded);
        $this->assertEquals(50.0, (float) SaleItem::find($itemId)->surcharge_amount);
        $sale->refresh();
        $this->assertEquals(50.0, (float) $sale->surcharge);
        $this->assertEquals(150.0, (float) $sale->total);
    }

    public function test_mixed_payment_only_takes_the_cash_share_from_the_drawer(): void
    {
        $p = $this->makeProduct(100);
        $sale = $this->sell([['product_id' => $p->id, 'quantity' => 1, 'price' => 100.0,
            'line_surcharge' => $this->surcharge(50)]], 150.0, [
            ['payment_method_id' => $this->cash->id, 'amount' => 100.0],
            ['payment_method_id' => $this->transfer->id, 'amount' => 50.0],
        ]);

        $c = $this->cancel($sale);

        $this->assertEquals(150.0, (float) $c->amount_refunded);
        $this->assertEquals(100.0, $this->cashOut($c));
    }

    // ─── legacy (descuento global, sin montos por línea) ────────────────────

    public function test_legacy_full_cancel_refunds_the_net_total(): void
    {
        $p = $this->makeProduct(280);
        $sale = $this->sellLegacy($p, 2, 280.0, 50.0); // cobró $510

        $c = $this->cancel($sale);

        $this->assertEquals(510.0, (float) $c->amount_refunded);
        $this->assertEquals(0.0, (float) $sale->refresh()->total);
    }

    public function test_legacy_partial_cancels_add_up_to_the_total(): void
    {
        $p = $this->makeProduct(100);
        $sale = $this->sellLegacy($p, 2, 100.0, 20.0); // cobró $180
        $itemId = $sale->items()->value('id');

        $first = $this->cancel($sale, [['sale_item_id' => $itemId, 'quantity' => 1]]);
        $this->assertEquals(90.0, (float) $first->amount_refunded);
        $this->assertEquals(90.0, (float) $sale->refresh()->total);

        $second = $this->cancel($sale->refresh(), [['sale_item_id' => $itemId, 'quantity' => 1]]);
        $this->assertEquals(90.0, (float) $second->amount_refunded);
        $this->assertEquals(0.0, (float) $sale->refresh()->total);
    }

    // ─── invariante ─────────────────────────────────────────────────────────

    public function test_cancelling_line_by_line_refunds_exactly_what_was_paid(): void
    {
        // A: 2 × $100 −$10 c/u ($180) · B: 1 × $100 +$20 ($120) → $300.
        $a = $this->makeProduct(100);
        $b = $this->makeProduct(100);
        $sale = $this->sell([
            ['product_id' => $a->id, 'quantity' => 2, 'price' => 100.0, 'line_discount' => $this->discount(10)],
            ['product_id' => $b->id, 'quantity' => 1, 'price' => 100.0, 'line_surcharge' => $this->surcharge(20)],
        ], 300.0);
        [$itemA, $itemB] = $sale->items()->orderBy('id')->pluck('id')->all();

        $refunds = [];
        $refunds[] = (float) $this->cancel($sale->refresh(), [['sale_item_id' => $itemA, 'quantity' => 1]])->amount_refunded;
        $refunds[] = (float) $this->cancel($sale->refresh(), [['sale_item_id' => $itemB, 'quantity' => 1]])->amount_refunded;
        $refunds[] = (float) $this->cancel($sale->refresh(), [['sale_item_id' => $itemA, 'quantity' => 1]])->amount_refunded;

        $this->assertEquals([90.0, 120.0, 90.0], $refunds);
        $sale->refresh();
        $this->assertEquals(0.0, (float) $sale->total);
        $this->assertSame(Sale::STATUS_RETURNED, $sale->status);
        $this->assertEquals(300.0, array_sum($refunds) + (float) $sale->total);

        // Cada snapshot: Σ line_total = amount_refunded.
        foreach (SaleCancellation::where('sale_id', $sale->id)->get() as $c) {
            $this->assertEquals(
                (float) $c->amount_refunded,
                round(array_sum(array_column($c->items_snapshot, 'line_total')), 2),
            );
        }
    }
}
