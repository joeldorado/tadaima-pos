<?php

declare(strict_types=1);

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
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Modelo de 2 stocks por tienda (2026-06-17):
 *  - Exhibición (`type='store'`): front, vendible en Caja.
 *  - Bodega (`type='bodega'`): backstock atrás, NO vendible.
 * La Caja vende solo de Exhibición; mover Bodega↔Exhibición con /inventory/move.
 */
class BodegaExhibicionTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;
    private Store $store;
    private Warehouse $exhibicion;
    private Warehouse $bodega;
    private User $admin;
    private User $cajero;
    private CashRegisterSession $session;
    private PaymentMethod $cash;

    protected function setUp(): void
    {
        parent::setUp();

        $this->company = Company::create(['name' => 'Tadaima Test']);
        $this->store = Store::create(['company_id' => $this->company->id, 'name' => 'Tienda Test', 'active' => true]);

        $this->exhibicion = Warehouse::create([
            'company_id' => $this->company->id, 'store_id' => $this->store->id,
            'name' => 'Exhibición', 'type' => 'store', 'active' => true,
        ]);
        $this->bodega = Warehouse::create([
            'company_id' => $this->company->id, 'store_id' => $this->store->id,
            'name' => 'Bodega', 'type' => 'bodega', 'active' => true,
        ]);

        $this->admin  = $this->makeUser('admin@test.com', 'admin', null);
        $this->cajero = $this->makeUser('cajero@test.com', 'cajero', $this->store->id);

        $register = CashRegister::create(['store_id' => $this->store->id, 'name' => 'Caja 1', 'active' => true]);
        $this->session = CashRegisterSession::create([
            'register_id' => $register->id, 'user_id' => $this->cajero->id,
            'opening_cash' => 0, 'status' => 'open', 'opened_at' => now(),
        ]);
        $this->cash = PaymentMethod::firstOrCreate(['name' => 'Efectivo'], ['active' => true]);
    }

    private function makeProduct(): Product
    {
        $product = Product::create([
            'company_id' => $this->company->id,
            'name' => 'Producto ' . uniqid(), 'sku' => 'SKU-' . uniqid(), 'active' => true,
        ]);
        $product->price()->create(['price_1' => 100]);
        return $product;
    }

    public function test_store_creation_creates_exhibicion_and_bodega_warehouses(): void
    {
        $this->actingAs($this->admin)
            ->postJson('/api/v1/stores', ['name' => 'Sucursal Nueva'])
            ->assertCreated();

        $store = Store::where('name', 'Sucursal Nueva')->firstOrFail();

        $this->assertDatabaseHas('warehouses', ['store_id' => $store->id, 'type' => 'store']);
        $this->assertDatabaseHas('warehouses', ['store_id' => $store->id, 'type' => 'bodega']);
        $this->assertSame(2, Warehouse::where('store_id', $store->id)->count(),
            'Una tienda nueva nace con exactamente 2 almacenes: Exhibición + Bodega');
    }

    public function test_checkout_sells_only_from_exhibicion(): void
    {
        $product = $this->makeProduct();
        // Stock SOLO en Bodega → no vendible en Caja.
        Inventory::create(['product_id' => $product->id, 'warehouse_id' => $this->bodega->id, 'quantity' => 10]);

        $service = app(CheckoutService::class);

        try {
            $service->checkoutDirect(
                storeId: $this->store->id, registerSessionId: $this->session->id, customerId: null,
                items: [['product_id' => $product->id, 'quantity' => 1, 'price' => 100.0]],
                paymentsData: [['payment_method_id' => $this->cash->id, 'amount' => 100.0]],
                discount: 0, userId: $this->cajero->id,
            );
            $this->fail('No debió vender: el stock está en Bodega, no en Exhibición.');
        } catch (\DomainException $e) {
            $this->assertStringContainsString('bodega', mb_strtolower($e->getMessage()),
                'El error debe avisar que hay stock en bodega para mover');
        }

        // Ahora con stock en Exhibición → vende.
        Inventory::create(['product_id' => $product->id, 'warehouse_id' => $this->exhibicion->id, 'quantity' => 5]);

        $sale = $service->checkoutDirect(
            storeId: $this->store->id, registerSessionId: $this->session->id, customerId: null,
            items: [['product_id' => $product->id, 'quantity' => 1, 'price' => 100.0]],
            paymentsData: [['payment_method_id' => $this->cash->id, 'amount' => 100.0]],
            discount: 0, userId: $this->cajero->id,
        );

        $this->assertNotNull($sale->id);
        // Descontó de Exhibición (5 → 4), Bodega intacta (10).
        $this->assertSame(4.0, (float) Inventory::where('product_id', $product->id)->where('warehouse_id', $this->exhibicion->id)->value('quantity'));
        $this->assertSame(10.0, (float) Inventory::where('product_id', $product->id)->where('warehouse_id', $this->bodega->id)->value('quantity'));
    }

    public function test_move_endpoint_moves_stock_bodega_to_exhibicion(): void
    {
        $product = $this->makeProduct();
        Inventory::create(['product_id' => $product->id, 'warehouse_id' => $this->bodega->id, 'quantity' => 10]);

        $this->actingAs($this->cajero)
            ->postJson('/api/v1/inventory/move', [
                'product_id' => $product->id,
                'from_warehouse_id' => $this->bodega->id,
                'to_warehouse_id' => $this->exhibicion->id,
                'quantity' => 4,
            ])
            ->assertOk();

        $this->assertSame(6.0, (float) Inventory::where('product_id', $product->id)->where('warehouse_id', $this->bodega->id)->value('quantity'));
        $this->assertSame(4.0, (float) Inventory::where('product_id', $product->id)->where('warehouse_id', $this->exhibicion->id)->value('quantity'));
    }

    public function test_move_rejects_insufficient_stock(): void
    {
        $product = $this->makeProduct();
        Inventory::create(['product_id' => $product->id, 'warehouse_id' => $this->bodega->id, 'quantity' => 2]);

        $this->actingAs($this->cajero)
            ->postJson('/api/v1/inventory/move', [
                'product_id' => $product->id,
                'from_warehouse_id' => $this->bodega->id,
                'to_warehouse_id' => $this->exhibicion->id,
                'quantity' => 5,
            ])
            ->assertStatus(422);
    }

    public function test_move_rejects_different_stores(): void
    {
        $otherStore = Store::create(['company_id' => $this->company->id, 'name' => 'Otra', 'active' => true]);
        $otherWh = Warehouse::create([
            'company_id' => $this->company->id, 'store_id' => $otherStore->id,
            'name' => 'Exhibición Otra', 'type' => 'store', 'active' => true,
        ]);
        $product = $this->makeProduct();
        Inventory::create(['product_id' => $product->id, 'warehouse_id' => $this->bodega->id, 'quantity' => 10]);

        $this->actingAs($this->admin)
            ->postJson('/api/v1/inventory/move', [
                'product_id' => $product->id,
                'from_warehouse_id' => $this->bodega->id,
                'to_warehouse_id' => $otherWh->id,
                'quantity' => 1,
            ])
            ->assertStatus(422);
    }

    public function test_products_light_stock_total_is_exhibicion_only(): void
    {
        $product = $this->makeProduct();
        Inventory::create(['product_id' => $product->id, 'warehouse_id' => $this->exhibicion->id, 'quantity' => 3]);
        Inventory::create(['product_id' => $product->id, 'warehouse_id' => $this->bodega->id, 'quantity' => 7]);

        $resp = $this->actingAs($this->cajero)
            ->getJson("/api/v1/products?light=1&store_id={$this->store->id}&per_page=0")
            ->assertOk()
            ->json('data');

        $row = collect($resp)->firstWhere('id', $product->id);
        $this->assertNotNull($row);
        $this->assertSame(3.0, (float) $row['stock_total'], 'stock_total en Caja = solo Exhibición');
        $this->assertSame(7.0, (float) $row['stock_bodega'], 'stock_bodega = backstock para el badge');
    }

    private function makeUser(string $email, string $roleName, ?int $storeId): User
    {
        $user = User::create([
            'name' => $email, 'email' => $email, 'password' => bcrypt('password'),
            'company_id' => $this->company->id, 'store_id' => $storeId, 'active' => true,
        ]);

        $roleId = DB::table('roles')->where('name', $roleName)->value('id')
            ?? DB::table('roles')->insertGetId([
                'name' => $roleName, 'guard_name' => 'api',
                'created_at' => now(), 'updated_at' => now(),
            ]);

        DB::table('model_has_roles')->insert([
            'role_id' => $roleId, 'model_type' => User::class, 'model_id' => $user->id,
        ]);

        return $user;
    }
}
