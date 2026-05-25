<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Customer;
use App\Models\Inventory;
use App\Models\Layaway;
use App\Models\LayawayPayment;
use App\Models\Product;
use App\Models\SaleItem;
use App\Models\Store;
use App\Models\User;
use App\Models\Warehouse;
use App\Services\LayawayService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Snap-at-creation para apartados:
 *
 *  - Layaway::create snap = products.cost (apartado descuenta inventario al
 *    crearse → ese es el momento contable correcto).
 *  - Layaway::deliver propaga `layaway.cost` al `sale_items.cost` resultante.
 *    NO consulta `products.cost` actual — eso rompería la cadena de snaps.
 */
class LayawayCostSnapshotTest extends TestCase
{
    use RefreshDatabase;

    private LayawayService $service;
    private User $user;
    private Store $store;
    private Warehouse $warehouse;
    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();
        $this->service = app(LayawayService::class);
        $company = Company::create(['name' => 'Test Co']);
        $this->store = Store::create(['company_id' => $company->id, 'name' => 'Store']);
        $this->user = User::create([
            'name' => 'C', 'email' => 'c@t.com', 'password' => bcrypt('x'),
            'company_id' => $company->id, 'store_id' => $this->store->id,
        ]);
        $this->warehouse = Warehouse::create([
            'company_id' => $company->id, 'store_id' => $this->store->id,
            'name' => 'Bodega', 'type' => 'store', 'active' => true,
        ]);
        $this->customer = Customer::create(['name' => 'Cliente']);
    }

    private function makeProductWithStock(?float $cost, float $price = 200.0, int $qty = 5): Product
    {
        $product = Product::create([
            'company_id' => $this->store->company_id,
            'name' => 'P-' . uniqid(), 'sku' => 'L-' . uniqid(),
            'cost' => $cost, 'active' => true,
        ]);
        $product->price()->create(['price_1' => $price]);
        Inventory::create([
            'product_id' => $product->id, 'warehouse_id' => $this->warehouse->id, 'quantity' => $qty,
        ]);
        return $product;
    }

    public function test_layaway_create_snaps_product_cost(): void
    {
        $product = $this->makeProductWithStock(cost: 120.00);

        $layaway = $this->service->create([
            'store_id'     => $this->store->id,
            'customer_id'  => $this->customer->id,
            'product_id'   => $product->id,
            'quantity'     => 1,
            'price'        => 200.00,
            'down_payment' => 50.00,
        ], $this->user->id);

        $this->assertSame(120.00, (float) $layaway->cost,
            'Layaway::create debe snap products.cost al crear el apartado');
    }

    public function test_layaway_deliver_propagates_layaway_cost_to_sale_item(): void
    {
        $product = $this->makeProductWithStock(cost: 100.00, price: 200.00);

        $layaway = $this->service->create([
            'store_id'     => $this->store->id,
            'customer_id'  => $this->customer->id,
            'product_id'   => $product->id,
            'quantity'     => 1,
            'price'        => 200.00,
            'down_payment' => 200.00, // liquida al crear
        ], $this->user->id);

        // Marcar como paid (down_payment cubrió total) — el servicio debería
        // hacerlo automáticamente al pagar 100%. Forzamos por si la lógica
        // del servicio aún no transiciona automático.
        if ($layaway->status !== Layaway::STATUS_PAID) {
            $layaway->update(['status' => Layaway::STATUS_PAID]);
        }

        // Mutar products.cost ANTES de deliver → la venta generada NO debe
        // verse afectada. Usa el layaway.cost (snapped al crear).
        $product->update(['cost' => 999.00]);

        $sale = $this->service->deliver($layaway, $this->user->id);

        $saleItem = SaleItem::where('sale_id', $sale->id)->first();
        $this->assertSame(100.00, (float) $saleItem->cost,
            'sale_items.cost generado por deliver debe heredar layaway.cost (no products.cost actual)');
    }

    public function test_layaway_with_null_product_cost_persists_null(): void
    {
        $product = $this->makeProductWithStock(cost: null);

        $layaway = $this->service->create([
            'store_id'     => $this->store->id,
            'customer_id'  => $this->customer->id,
            'product_id'   => $product->id,
            'quantity'     => 1,
            'price'        => 200.00,
            'down_payment' => 50.00,
        ], $this->user->id);

        $this->assertNull($layaway->cost,
            'products.cost null → layaway.cost null (no coerce a 0)');
    }
}
