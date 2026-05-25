<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Customer;
use App\Models\PreSaleCatalog;
use App\Models\PreSaleOrder;
use App\Models\PreSaleOrderItem;
use App\Models\Product;
use App\Models\Store;
use App\Models\User;
use App\Services\PreSaleOrderService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Snap-at-creation para items de folio de preventa.
 *
 *  - Si el catálogo está vinculado a Product → snap = products.cost
 *  - Si el catálogo aún no tiene Product (pre-arrival) → snap = catalog.cost
 *  - Nunca se re-snap (la liquidación / entrega no modifica el cost)
 */
class PreSaleOrderCostSnapshotTest extends TestCase
{
    use RefreshDatabase;

    private PreSaleOrderService $service;
    private User $user;
    private Store $store;
    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();
        $this->service = app(PreSaleOrderService::class);
        $company = Company::create(['name' => 'Test Co']);
        $this->store = Store::create(['company_id' => $company->id, 'name' => 'Store']);
        $this->user = User::create([
            'name' => 'C', 'email' => 'c@t.com', 'password' => bcrypt('x'),
            'company_id' => $company->id, 'store_id' => $this->store->id,
        ]);
        $this->customer = Customer::create(['name' => 'Cliente']);
    }

    private function makeCatalog(array $overrides = []): PreSaleCatalog
    {
        $catalog = PreSaleCatalog::create(array_merge([
            'product_name' => 'Item ' . uniqid(),
            'price_1'      => 200.00,
            'status'       => PreSaleCatalog::STATUS_PUBLISHED,
            'created_by'   => $this->user->id,
        ], $overrides));
        $catalog->storeLimits()->create(['store_id' => $this->store->id, 'limit_qty' => 99]);
        return $catalog;
    }

    public function test_item_snaps_cost_from_linked_product_at_creation(): void
    {
        $product = Product::create([
            'company_id' => $this->store->company_id,
            'name' => 'Linked', 'sku' => 'L-' . uniqid(),
            'cost' => 50.00, 'active' => true,
        ]);
        $catalog = $this->makeCatalog(['product_id' => $product->id, 'cost' => 99.00]);

        $order = $this->service->createOrder([
            'store_id'    => $this->store->id,
            'customer_id' => $this->customer->id,
            'items'       => [['catalog_id' => $catalog->id, 'quantity' => 1, 'price_level' => 1]],
        ], $this->user->id);

        $item = $order->items()->first();
        $this->assertSame(50.00, (float) $item->cost,
            'Con product_id vinculado, snap usa products.cost (no catalog.cost)');
    }

    public function test_item_falls_back_to_catalog_cost_when_no_linked_product(): void
    {
        // Catálogo pre-arrival: sin product_id, solo cost del proveedor en data maestra.
        $catalog = $this->makeCatalog(['product_id' => null, 'cost' => 80.00]);

        $order = $this->service->createOrder([
            'store_id'    => $this->store->id,
            'customer_id' => $this->customer->id,
            'items'       => [['catalog_id' => $catalog->id, 'quantity' => 1, 'price_level' => 1]],
        ], $this->user->id);

        $item = $order->items()->first();
        $this->assertSame(80.00, (float) $item->cost,
            'Sin product vinculado, snap usa catalog.cost del proveedor');
    }

    public function test_mutating_product_cost_after_creation_does_not_change_item_cost(): void
    {
        $product = Product::create([
            'company_id' => $this->store->company_id,
            'name' => 'M', 'sku' => 'M-' . uniqid(),
            'cost' => 100.00, 'active' => true,
        ]);
        $catalog = $this->makeCatalog(['product_id' => $product->id]);

        $order = $this->service->createOrder([
            'store_id'    => $this->store->id,
            'customer_id' => $this->customer->id,
            'items'       => [['catalog_id' => $catalog->id, 'quantity' => 1, 'price_level' => 1]],
        ], $this->user->id);

        // Cambio post-creación
        $product->update(['cost' => 500.00]);

        $item = $order->items()->first();
        $this->assertSame(100.00, (float) $item->cost,
            'Mutar products.cost después de crear el folio NO debe afectar el cost del item');
    }
}
