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
use App\Models\Store;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Scoping por tienda de promos NxM (2026-07-16): store_id NULL = todas las
 * tiendas; con valor = solo esa sucursal. El checkout solo aplica promos de la
 * tienda de la venta (o globales).
 */
class PromoStoreScopeTest extends TestCase
{
    use RefreshDatabase;

    private User $user;
    private Store $storeA;
    private Store $storeB;
    private CashRegisterSession $session;
    private PaymentMethod $cashMethod;
    private Product $product;

    protected function setUp(): void
    {
        parent::setUp();

        $company = Company::create(['name' => 'Test Co']);
        $this->storeA = Store::create(['company_id' => $company->id, 'name' => 'Tienda A']);
        $this->storeB = Store::create(['company_id' => $company->id, 'name' => 'Tienda B']);
        $this->user = User::create([
            'name' => 'Cajero', 'email' => 'cajero@test.com', 'password' => bcrypt('x'),
            'company_id' => $company->id, 'store_id' => $this->storeA->id,
        ]);
        $warehouse = Warehouse::create([
            'company_id' => $company->id, 'store_id' => $this->storeA->id,
            'name' => 'Exhibición', 'type' => 'store', 'active' => true,
        ]);
        $register = CashRegister::create(['store_id' => $this->storeA->id, 'name' => 'Caja 1', 'active' => true]);
        $this->session = CashRegisterSession::create([
            'register_id' => $register->id, 'user_id' => $this->user->id,
            'opening_cash' => 0, 'status' => 'open', 'opened_at' => now(),
        ]);
        $this->cashMethod = PaymentMethod::firstOrCreate(['name' => 'Efectivo'], ['active' => true]);

        $this->product = Product::create([
            'company_id' => $company->id, 'name' => 'Producto Promo', 'sku' => 'SKU-PROMO', 'cost' => 50, 'active' => true,
        ]);
        $this->product->price()->create(['price_1' => 100.0]);
        Inventory::create(['product_id' => $this->product->id, 'warehouse_id' => $warehouse->id, 'quantity' => 100]);
    }

    private function checkout(float $payment): \Illuminate\Testing\TestResponse
    {
        return $this->actingAs($this->user)->postJson('/api/v1/sales', [
            'store_id'            => $this->storeA->id,
            'register_session_id' => $this->session->id,
            'calc_version'        => 2,
            'items'               => [['product_id' => $this->product->id, 'quantity' => 2, 'price' => 100.0]],
            'payments'            => [['payment_method_id' => $this->cashMethod->id, 'amount' => $payment]],
        ]);
    }

    private function makePromo(?int $storeId): ProductPromotion
    {
        return ProductPromotion::create([
            'product_id' => $this->product->id, 'store_id' => $storeId,
            'name' => '2x1 Test', 'buy_n' => 2, 'pay_m' => 1, 'status' => 'active', 'priority' => 0,
        ]);
    }

    public function test_global_promo_applies_in_any_store(): void
    {
        $this->makePromo(null);

        // 2×$100 con 2x1 → paga $100.
        $this->checkout(100.0)->assertStatus(201)->assertJsonPath('data.total', 100);
    }

    public function test_same_store_promo_applies(): void
    {
        $this->makePromo($this->storeA->id);

        $this->checkout(100.0)->assertStatus(201)->assertJsonPath('data.total', 100);
    }

    public function test_other_store_promo_does_not_apply(): void
    {
        $this->makePromo($this->storeB->id);

        // La promo es de la tienda B → en tienda A se cobra completo ($200).
        $this->checkout(200.0)->assertStatus(201)->assertJsonPath('data.total', 200);
    }

    public function test_products_embed_filters_promos_by_store(): void
    {
        $this->makePromo($this->storeB->id);
        $globalPromo = $this->makePromo(null);

        $resp = $this->actingAs($this->user)->getJson("/api/v1/products?light=1&per_page=0&store_id={$this->storeA->id}&include_unassigned=1");
        $resp->assertOk();
        $row = collect($resp->json('data'))->firstWhere('id', $this->product->id);
        $ids = array_column($row['active_promotions'] ?? [], 'id');

        $this->assertContains($globalPromo->id, $ids);
        $this->assertCount(1, $ids, 'La promo de otra tienda no debe venir en el embed');
    }
}
