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
use App\Models\SaleItem;
use App\Models\SalesDraft;
use App\Models\SalesDraftItem;
use App\Models\Store;
use App\Models\User;
use App\Models\Warehouse;
use App\Services\CheckoutService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Snap-at-creation: `sale_items.cost` debe quedar congelado con el costo del
 * producto al momento EXACTO del insert. Cambios posteriores a `products.cost`
 * NO deben tocar registros de venta ya creados — esta es la invariante que
 * garantiza que los reportes históricos no drifteen cuando el admin re-precia.
 */
class CheckoutCostSnapshotTest extends TestCase
{
    use RefreshDatabase;

    private CheckoutService $service;
    private User $user;
    private Store $store;
    private Warehouse $warehouse;
    private CashRegister $register;
    private CashRegisterSession $session;
    private PaymentMethod $cashMethod;

    protected function setUp(): void
    {
        parent::setUp();

        $this->service = app(CheckoutService::class);

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
        $this->register = CashRegister::create([
            'store_id' => $this->store->id, 'name' => 'Caja 1', 'active' => true,
        ]);
        $this->session = CashRegisterSession::create([
            'register_id' => $this->register->id, 'user_id' => $this->user->id,
            'opening_cash' => 0, 'status' => 'open', 'opened_at' => now(),
        ]);
        $this->cashMethod = PaymentMethod::firstOrCreate(['name' => 'Efectivo'], ['active' => true]);
    }

    private function makeProductWithStock(float $cost, float $price = 200.0, int $qty = 10): Product
    {
        $product = Product::create([
            'company_id' => $this->store->company_id,
            'name'       => 'Producto ' . uniqid(),
            'sku'        => 'SKU-' . uniqid(),
            'cost'       => $cost,
            'active'     => true,
        ]);
        $product->price()->create(['price_1' => $price]);
        Inventory::create([
            'product_id' => $product->id, 'warehouse_id' => $this->warehouse->id, 'quantity' => $qty,
        ]);
        return $product;
    }

    private function makeDraftWithItem(Product $product, float $qty = 1, float $price = 200.0): SalesDraft
    {
        $draft = SalesDraft::create([
            'store_id'            => $this->store->id,
            'register_session_id' => $this->session->id,
            'user_id'             => $this->user->id,
            'status'              => SalesDraft::STATUS_OPEN,
        ]);
        SalesDraftItem::create([
            'draft_id' => $draft->id, 'product_id' => $product->id,
            'quantity' => $qty, 'price' => $price, 'total' => $qty * $price,
        ]);
        return $draft;
    }

    public function test_sale_item_snaps_product_cost_at_insert(): void
    {
        $product = $this->makeProductWithStock(cost: 100.00, price: 200.00);
        $draft   = $this->makeDraftWithItem($product, qty: 1, price: 200.00);

        $sale = $this->service->checkout(
            draftId:      $draft->id,
            paymentsData: [['payment_method_id' => $this->cashMethod->id, 'amount' => 200.00]],
            discount:     0,
            userId:       $this->user->id,
        );

        $saleItem = SaleItem::where('sale_id', $sale->id)->first();
        $this->assertNotNull($saleItem);
        $this->assertSame(100.00, (float) $saleItem->cost,
            'sale_items.cost debe igualarse al products.cost al momento del INSERT');
    }

    public function test_mutating_product_cost_after_sale_does_not_change_sale_item_cost(): void
    {
        $product = $this->makeProductWithStock(cost: 100.00, price: 200.00);
        $draft   = $this->makeDraftWithItem($product, qty: 1, price: 200.00);

        $sale = $this->service->checkout(
            draftId:      $draft->id,
            paymentsData: [['payment_method_id' => $this->cashMethod->id, 'amount' => 200.00]],
            discount:     0,
            userId:       $this->user->id,
        );

        // El admin re-precia el producto DESPUÉS de la venta — el costo
        // del sale_item NO debe cambiar (es la invariante load-bearing).
        $product->update(['cost' => 999.00]);

        $saleItem = SaleItem::where('sale_id', $sale->id)->first();
        $this->assertSame(100.00, (float) $saleItem->cost,
            'mutar products.cost después de la venta NO debe afectar sale_items.cost histórico');
    }

    public function test_checkout_direct_snaps_cost_through_to_sale_item(): void
    {
        $product = $this->makeProductWithStock(cost: 75.00, price: 150.00);

        $sale = $this->service->checkoutDirect(
            storeId:           $this->store->id,
            registerSessionId: $this->session->id,
            customerId:        null,
            items:             [['product_id' => $product->id, 'quantity' => 2, 'price' => 150.00]],
            paymentsData:      [['payment_method_id' => $this->cashMethod->id, 'amount' => 300.00]],
            discount:          0,
            userId:            $this->user->id,
        );

        $saleItem = SaleItem::where('sale_id', $sale->id)->first();
        $this->assertSame(75.00, (float) $saleItem->cost,
            'checkoutDirect (ADR-014 client-cart) también debe snap cost al insertar sale_items');
    }

    public function test_sale_item_cost_is_null_when_product_cost_is_null(): void
    {
        $product = $this->makeProductWithStock(cost: 0.0, price: 200.00);
        // forzar NULL explícito (cost=0 != null para el modelo)
        $product->update(['cost' => null]);
        $draft = $this->makeDraftWithItem($product, qty: 1, price: 200.00);

        $sale = $this->service->checkout(
            draftId:      $draft->id,
            paymentsData: [['payment_method_id' => $this->cashMethod->id, 'amount' => 200.00]],
            discount:     0,
            userId:       $this->user->id,
        );

        $saleItem = SaleItem::where('sale_id', $sale->id)->first();
        $this->assertNull($saleItem->cost,
            'cost null en producto → sale_items.cost null (no coerce a 0)');
    }
}
