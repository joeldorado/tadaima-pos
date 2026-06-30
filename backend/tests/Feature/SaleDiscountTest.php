<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\CashRegister;
use App\Models\CashRegisterSession;
use App\Models\Company;
use App\Models\Inventory;
use App\Models\PaymentMethod;
use App\Models\Product;
use App\Models\Sale;
use App\Models\Store;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Promo / descuento por cantidad (Joel 2026-06-29). El frontend ahora SÍ manda
 * `discount` (monto en pesos) en el checkout. El backend ya recalculaba
 * `total = subtotal − discount` y lo guarda; aquí blindamos ese contrato y el
 * prorrateo del descuento en /reports/top-products (que no infle el revenue
 * por producto).
 */
class SaleDiscountTest extends TestCase
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
        Warehouse::create([
            'company_id' => $company->id, 'store_id' => $this->store->id,
            'name' => 'Bodega', 'type' => 'store', 'active' => true,
        ]);
        $register = CashRegister::create(['store_id' => $this->store->id, 'name' => 'Caja 1', 'active' => true]);
        $this->session = CashRegisterSession::create([
            'register_id' => $register->id, 'user_id' => $this->user->id,
            'opening_cash' => 0, 'status' => 'open', 'opened_at' => now(),
        ]);
        $this->cashMethod = PaymentMethod::firstOrCreate(['name' => 'Efectivo'], ['active' => true]);
    }

    private function makeProduct(float $price, float $cost = 50): Product
    {
        $warehouse = Warehouse::where('store_id', $this->store->id)->first();
        $product = Product::create([
            'company_id' => $this->store->company_id,
            'name' => 'Producto ' . uniqid(), 'sku' => 'SKU-' . uniqid(),
            'cost' => $cost, 'active' => true,
        ]);
        $product->price()->create(['price_1' => $price]);
        Inventory::create(['product_id' => $product->id, 'warehouse_id' => $warehouse->id, 'quantity' => 100]);
        return $product;
    }

    public function test_discount_recalculates_total_and_persists(): void
    {
        // Subtotal 560 (2 × 280), promo "2 funkos = 510" → descuento 50, total 510.
        $product = $this->makeProduct(280);

        $this->actingAs($this->user)
            ->postJson('/api/v1/sales', [
                'store_id' => $this->store->id,
                'register_session_id' => $this->session->id,
                'items' => [['product_id' => $product->id, 'quantity' => 2, 'price' => 280.0]],
                'payments' => [['payment_method_id' => $this->cashMethod->id, 'amount' => 510.0]],
                'discount' => 50,
            ])
            ->assertStatus(201)
            ->assertJsonPath('data.subtotal', 560)
            ->assertJsonPath('data.discount', 50)
            ->assertJsonPath('data.total', 510);

        $sale = Sale::latest('id')->first();
        $this->assertSame(560.0, (float) $sale->subtotal);
        $this->assertSame(50.0, (float) $sale->discount);
        $this->assertSame(510.0, (float) $sale->total);
    }

    public function test_payments_must_match_discounted_total(): void
    {
        // Si el pago no baja al total descontado, el guard del backend lo rechaza.
        $product = $this->makeProduct(280);

        $this->actingAs($this->user)
            ->postJson('/api/v1/sales', [
                'store_id' => $this->store->id,
                'register_session_id' => $this->session->id,
                'items' => [['product_id' => $product->id, 'quantity' => 2, 'price' => 280.0]],
                'payments' => [['payment_method_id' => $this->cashMethod->id, 'amount' => 560.0]],
                'discount' => 50,
            ])
            ->assertStatus(422);
    }

    public function test_top_products_allocates_discount_to_revenue(): void
    {
        // 1 producto $100, descuento $20 → total $80. El top-products debe reportar
        // $80 de revenue para ese producto (prorrateado), NO $100.
        $product = $this->makeProduct(100);

        $this->actingAs($this->user)
            ->postJson('/api/v1/sales', [
                'store_id' => $this->store->id,
                'register_session_id' => $this->session->id,
                'items' => [['product_id' => $product->id, 'quantity' => 1, 'price' => 100.0]],
                'payments' => [['payment_method_id' => $this->cashMethod->id, 'amount' => 80.0]],
                'discount' => 20,
            ])
            ->assertStatus(201);

        $resp = $this->actingAs($this->user)
            ->getJson('/api/v1/reports/top-products?from=' . now()->subDay()->toDateString() . '&to=' . now()->addDay()->toDateString())
            ->assertStatus(200);

        $row = collect($resp->json('data.data'))->firstWhere('id', $product->id);
        $this->assertNotNull($row, 'El producto debe aparecer en top-products');
        $this->assertSame(80.0, (float) $row['total_revenue']);
    }

    public function test_top_products_without_discount_is_full_revenue(): void
    {
        // Control: sin descuento, subtotal===total → ratio 1 → revenue completo.
        $product = $this->makeProduct(100);

        $this->actingAs($this->user)
            ->postJson('/api/v1/sales', [
                'store_id' => $this->store->id,
                'register_session_id' => $this->session->id,
                'items' => [['product_id' => $product->id, 'quantity' => 1, 'price' => 100.0]],
                'payments' => [['payment_method_id' => $this->cashMethod->id, 'amount' => 100.0]],
                'discount' => 0,
            ])
            ->assertStatus(201);

        $resp = $this->actingAs($this->user)
            ->getJson('/api/v1/reports/top-products?from=' . now()->subDay()->toDateString() . '&to=' . now()->addDay()->toDateString())
            ->assertStatus(200);

        $row = collect($resp->json('data.data'))->firstWhere('id', $product->id);
        $this->assertNotNull($row);
        $this->assertSame(100.0, (float) $row['total_revenue']);
    }
}
