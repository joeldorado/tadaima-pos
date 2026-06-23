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
 * Persistencia de dólares físicos recibidos por venta + TC usado.
 * Antes solo se guardaba el MXN equivalente; ahora `sales.cash_received_usd` y
 * `sales.exchange_rate` quedan registrados para Historial/Corte/Reporte.
 */
class SaleUsdReceivedTest extends TestCase
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

    private function makeProduct(float $price = 200.0, int $qty = 10): Product
    {
        $warehouse = Warehouse::where('store_id', $this->store->id)->first();
        $product = Product::create([
            'company_id' => $this->store->company_id,
            'name' => 'Producto ' . uniqid(), 'sku' => 'SKU-' . uniqid(),
            'cost' => 50, 'active' => true,
        ]);
        $product->price()->create(['price_1' => $price]);
        Inventory::create(['product_id' => $product->id, 'warehouse_id' => $warehouse->id, 'quantity' => $qty]);
        return $product;
    }

    private function payload(Product $product, array $extra = []): array
    {
        return array_merge([
            'store_id' => $this->store->id,
            'register_session_id' => $this->session->id,
            'items' => [['product_id' => $product->id, 'quantity' => 1, 'price' => 200.0]],
            'payments' => [['payment_method_id' => $this->cashMethod->id, 'amount' => 200.0]],
            'discount' => 0,
        ], $extra);
    }

    public function test_sale_persists_usd_received_and_exchange_rate(): void
    {
        $product = $this->makeProduct();

        $resp = $this->actingAs($this->user)
            ->postJson('/api/v1/sales', $this->payload($product, [
                'cash_received_usd' => 50,
                'exchange_rate' => 18.5,
            ]))
            ->assertStatus(201)
            ->assertJsonPath('data.cash_received_usd', 50)
            ->assertJsonPath('data.exchange_rate', 18.5);

        $sale = Sale::latest('id')->first();
        $this->assertSame(50.0, (float) $sale->cash_received_usd);
        $this->assertSame(18.5, (float) $sale->exchange_rate);
    }

    public function test_sale_without_usd_leaves_columns_null(): void
    {
        $product = $this->makeProduct();

        $this->actingAs($this->user)
            ->postJson('/api/v1/sales', $this->payload($product))
            ->assertStatus(201)
            ->assertJsonPath('data.cash_received_usd', null);

        $sale = Sale::latest('id')->first();
        $this->assertNull($sale->cash_received_usd);
        $this->assertNull($sale->exchange_rate);
    }

    public function test_zero_usd_is_stored_as_null(): void
    {
        $product = $this->makeProduct();

        $this->actingAs($this->user)
            ->postJson('/api/v1/sales', $this->payload($product, [
                'cash_received_usd' => 0,
                'exchange_rate' => 18.5,
            ]))
            ->assertStatus(201);

        // 0 USD = no entraron dólares → null (no contamina reportes con $0).
        $this->assertNull(Sale::latest('id')->first()->cash_received_usd);
    }

    public function test_sale_persists_cash_received_and_change(): void
    {
        $product = $this->makeProduct();

        $this->actingAs($this->user)
            ->postJson('/api/v1/sales', $this->payload($product, [
                'cash_received' => 250,
                'change_amount' => 50,
            ]))
            ->assertStatus(201)
            ->assertJsonPath('data.cash_received', 250)
            ->assertJsonPath('data.change_amount', 50);

        $sale = Sale::latest('id')->first();
        $this->assertSame(250.0, (float) $sale->cash_received);
        $this->assertSame(50.0, (float) $sale->change_amount);
    }

    public function test_cash_received_with_usd_and_exact_change(): void
    {
        $product = $this->makeProduct();

        // 100 MXN físicos + 100 USD a 1.0 = 200 entregados, total 200 → cambio 0.
        $this->actingAs($this->user)
            ->postJson('/api/v1/sales', $this->payload($product, [
                'cash_received_usd' => 100,
                'exchange_rate' => 1.0,
                'cash_received' => 200,
                'change_amount' => 0,
            ]))
            ->assertStatus(201)
            ->assertJsonPath('data.cash_received_usd', 100)
            ->assertJsonPath('data.cash_received', 200)
            // Cambio exacto se persiste como 0 (no null) cuando hubo efectivo.
            ->assertJsonPath('data.change_amount', 0);

        $sale = Sale::latest('id')->first();
        $this->assertSame(0.0, (float) $sale->change_amount);
    }

    public function test_card_payment_leaves_cash_columns_null(): void
    {
        $product = $this->makeProduct();

        // Pago sin desglose de efectivo (tarjeta/transferencia) → null.
        $this->actingAs($this->user)
            ->postJson('/api/v1/sales', $this->payload($product))
            ->assertStatus(201)
            ->assertJsonPath('data.cash_received', null)
            ->assertJsonPath('data.change_amount', null);

        $sale = Sale::latest('id')->first();
        $this->assertNull($sale->cash_received);
        $this->assertNull($sale->change_amount);
    }
}
