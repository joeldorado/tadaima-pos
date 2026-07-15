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
use App\Models\SaleItem;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Promociones NxM en el checkout v2 (Fase 3): el SERVER evalúa las promos
 * vigentes y aplica la mejor por línea — el cliente nunca decide el monto.
 * No-stacking: descuento manual excluye la promo. Snapshot en sale_items
 * (promo_name/promo_free_qty, espíritu ADR-015).
 */
class PromotionCheckoutTest extends TestCase
{
    use RefreshDatabase;

    private User $user;
    private Store $store;
    private CashRegisterSession $session;
    private PaymentMethod $cashMethod;

    protected function setUp(): void
    {
        parent::setUp();

        $company = Company::create(['name' => 'Test Co']);
        $this->store = Store::create(['company_id' => $company->id, 'name' => 'Test Store']);
        $this->user = User::create([
            'name' => 'Cajero', 'email' => 'cajero@test.com', 'password' => bcrypt('x'),
            'company_id' => $company->id, 'store_id' => $this->store->id,
        ]);
        \App\Models\Warehouse::create([
            'company_id' => $company->id, 'store_id' => $this->store->id,
            'name' => 'Exhibición', 'type' => 'store', 'active' => true,
        ]);
        $register = CashRegister::create(['store_id' => $this->store->id, 'name' => 'Caja 1', 'active' => true]);
        $this->session = CashRegisterSession::create([
            'register_id' => $register->id, 'user_id' => $this->user->id,
            'opening_cash' => 0, 'status' => 'open', 'opened_at' => now(),
        ]);
        $this->cashMethod = PaymentMethod::firstOrCreate(['name' => 'Efectivo'], ['active' => true]);
    }

    private function makeProduct(float $price): Product
    {
        $warehouse = \App\Models\Warehouse::where('store_id', $this->store->id)->first();
        $product = Product::create([
            'company_id' => $this->store->company_id,
            'name' => 'Producto ' . uniqid(), 'sku' => 'SKU-' . uniqid(),
            'cost' => 10, 'active' => true,
        ]);
        $product->price()->create(['price_1' => $price]);
        Inventory::create(['product_id' => $product->id, 'warehouse_id' => $warehouse->id, 'quantity' => 100]);
        return $product;
    }

    private function checkout(array $items, float $paymentAmount)
    {
        return $this->actingAs($this->user)->postJson('/api/v1/sales', [
            'store_id'            => $this->store->id,
            'register_session_id' => $this->session->id,
            'calc_version'        => 2,
            'items'               => $items,
            'payments'            => [['payment_method_id' => $this->cashMethod->id, 'amount' => $paymentAmount]],
        ]);
    }

    public function test_2x1_applies_server_side_with_snapshot(): void
    {
        $product = $this->makeProduct(50);
        ProductPromotion::create([
            'product_id' => $product->id, 'name' => '2x1 Verano', 'buy_n' => 2, 'pay_m' => 1,
        ]);

        // 3 uds @ $50 con 2x1 → 1 gratis ($50) + 1 resto → total $100.
        $this->checkout([
            ['product_id' => $product->id, 'quantity' => 3, 'price' => 50.0],
        ], 100.0)
            ->assertStatus(201)
            ->assertJsonPath('data.subtotal', 150)
            ->assertJsonPath('data.discount', 50)
            ->assertJsonPath('data.total', 100);

        $item = SaleItem::first();
        $this->assertSame('promo', $item->benefit_type);
        $this->assertSame(50.0, (float) $item->discount_amount);
        $this->assertSame('2x1 Verano', $item->promo_name);
        $this->assertSame(1, (int) $item->promo_free_qty);
        $this->assertNotNull($item->applied_promotion_id);
    }

    public function test_best_promo_wins_when_multiple_valid(): void
    {
        $product = $this->makeProduct(50);
        ProductPromotion::create(['product_id' => $product->id, 'name' => '3x2', 'buy_n' => 3, 'pay_m' => 2, 'priority' => 9]);
        ProductPromotion::create(['product_id' => $product->id, 'name' => '2x1', 'buy_n' => 2, 'pay_m' => 1, 'priority' => 0]);

        // 6 uds: 3x2 → 2 gratis ($100) · 2x1 → 3 gratis ($150). Gana 2x1 pese
        // a menor priority (mayor ahorro manda; priority solo desempata).
        $this->checkout([
            ['product_id' => $product->id, 'quantity' => 6, 'price' => 50.0],
        ], 150.0)
            ->assertStatus(201)
            ->assertJsonPath('data.discount', 150)
            ->assertJsonPath('data.total', 150);

        $this->assertSame('2x1', SaleItem::first()->promo_name);
    }

    public function test_manual_discount_excludes_promo_no_stacking(): void
    {
        $product = $this->makeProduct(50);
        ProductPromotion::create(['product_id' => $product->id, 'name' => '2x1', 'buy_n' => 2, 'pay_m' => 1]);

        // Línea con descuento manual → la promo NO aplica sobre esa línea.
        // 2 uds @ $50 − 10% línea = $90 (la promo habría dado $50 de beneficio,
        // pero manual > promo por regla de negocio, aunque sea peor trato).
        $this->checkout([
            ['product_id' => $product->id, 'quantity' => 2, 'price' => 50.0,
             'line_discount' => ['kind' => 'percent', 'basis' => 'line', 'value' => 10, 'reason' => 'danado']],
        ], 90.0)
            ->assertStatus(201)
            ->assertJsonPath('data.discount', 10)
            ->assertJsonPath('data.total', 90);

        $item = SaleItem::first();
        $this->assertSame('discount', $item->benefit_type);
        $this->assertNull($item->applied_promotion_id);
    }

    public function test_paused_and_expired_promos_do_not_apply(): void
    {
        $product = $this->makeProduct(50);
        ProductPromotion::create([
            'product_id' => $product->id, 'name' => 'Pausada', 'buy_n' => 2, 'pay_m' => 1,
            'status' => ProductPromotion::STATUS_PAUSED,
        ]);
        ProductPromotion::create([
            'product_id' => $product->id, 'name' => 'Vencida', 'buy_n' => 2, 'pay_m' => 1,
            'ends_at' => now()->subDay(),
        ]);
        ProductPromotion::create([
            'product_id' => $product->id, 'name' => 'Futura', 'buy_n' => 2, 'pay_m' => 1,
            'starts_at' => now()->addDay(),
        ]);

        // Ninguna vigente → precio completo.
        $this->checkout([
            ['product_id' => $product->id, 'quantity' => 2, 'price' => 50.0],
        ], 100.0)
            ->assertStatus(201)
            ->assertJsonPath('data.discount', 0)
            ->assertJsonPath('data.total', 100);
    }

    public function test_qty_below_n_pays_full_price(): void
    {
        $product = $this->makeProduct(50);
        ProductPromotion::create(['product_id' => $product->id, 'name' => '3x2', 'buy_n' => 3, 'pay_m' => 2]);

        $this->checkout([
            ['product_id' => $product->id, 'quantity' => 2, 'price' => 50.0],
        ], 100.0)
            ->assertStatus(201)
            ->assertJsonPath('data.discount', 0)
            ->assertJsonPath('data.total', 100);
    }

    public function test_promo_payment_mismatch_rejected(): void
    {
        // El cliente ignora la promo y paga completo → el server recomputa
        // $100 y el pago de $150 no cuadra → 422 (nunca se cobra de más).
        $product = $this->makeProduct(50);
        ProductPromotion::create(['product_id' => $product->id, 'name' => '2x1', 'buy_n' => 2, 'pay_m' => 1]);

        $this->checkout([
            ['product_id' => $product->id, 'quantity' => 3, 'price' => 50.0],
        ], 150.0)->assertStatus(422);

        $this->assertSame(0, Sale::count());
    }
}
