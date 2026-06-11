<?php

namespace Tests\Feature;

use App\Models\CashRegister;
use App\Models\CashRegisterSession;
use App\Models\Company;
use App\Models\Customer;
use App\Models\PaymentMethod;
use App\Models\PreSaleCatalog;
use App\Models\PreSaleOrder;
use App\Models\Product;
use App\Models\Sale;
use App\Models\Store;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Refuerzo P0 (2026-06-10): el server confiaba en el store_id/warehouse_id del
 * request — un gerente/cajero podía escribir sobre datos de OTRA tienda
 * (ajustar stock, crear folios, cobrar, cancelar). Ahora los guards
 * (User::canActOnStore + Controller::storeScopeError) regresan 403.
 */
class StoreScopeEnforcementTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;
    private Store $storeA;
    private Store $storeB;
    private Warehouse $warehouseA;
    private Warehouse $warehouseB;
    private User $admin;
    private User $gerenteA;
    private Product $product;

    protected function setUp(): void
    {
        parent::setUp();

        $this->company = Company::create(['name' => 'Tadaima Test']);
        $this->storeA = Store::create(['company_id' => $this->company->id, 'name' => 'Tienda A', 'active' => true]);
        $this->storeB = Store::create(['company_id' => $this->company->id, 'name' => 'Tienda B', 'active' => true]);

        $this->warehouseA = Warehouse::create([
            'company_id' => $this->company->id, 'store_id' => $this->storeA->id,
            'name' => 'Bodega A', 'type' => 'store', 'active' => true,
        ]);
        $this->warehouseB = Warehouse::create([
            'company_id' => $this->company->id, 'store_id' => $this->storeB->id,
            'name' => 'Bodega B', 'type' => 'store', 'active' => true,
        ]);

        $this->admin = $this->makeUser('admin@test.com', 'admin', null);
        $this->gerenteA = $this->makeUser('gerente.a@test.com', 'gerente', $this->storeA->id);

        $this->product = Product::create([
            'name' => 'Producto Test', 'sku' => 'SKU-1', 'price_1' => 100, 'active' => true,
        ]);
    }

    // ── Inventario ────────────────────────────────────────────────────────────

    public function test_gerente_cannot_adjust_stock_of_another_stores_warehouse(): void
    {
        $this->actingAs($this->gerenteA)
            ->putJson("/api/v1/inventory/{$this->product->id}/{$this->warehouseB->id}", ['quantity' => 50])
            ->assertForbidden();

        $this->assertDatabaseMissing('inventory', [
            'product_id' => $this->product->id, 'warehouse_id' => $this->warehouseB->id,
        ]);
    }

    public function test_gerente_can_adjust_stock_of_own_store(): void
    {
        $this->actingAs($this->gerenteA)
            ->putJson("/api/v1/inventory/{$this->product->id}/{$this->warehouseA->id}", ['quantity' => 50])
            ->assertOk();
    }

    public function test_admin_can_adjust_stock_of_any_store(): void
    {
        $this->actingAs($this->admin)
            ->putJson("/api/v1/inventory/{$this->product->id}/{$this->warehouseB->id}", ['quantity' => 10])
            ->assertOk();
    }

    public function test_gerente_cannot_create_movement_for_another_stores_warehouse(): void
    {
        $this->actingAs($this->gerenteA)
            ->postJson('/api/v1/inventory/movements', [
                'product_id'   => $this->product->id,
                'warehouse_id' => $this->warehouseB->id,
                'type'         => 'entrada',
                'quantity'     => 5,
            ])
            ->assertForbidden();
    }

    public function test_gerente_cannot_adjust_manga_inventory_of_another_store(): void
    {
        $manga = Product::create([
            'name' => 'Manga Test', 'sku' => 'MNG-1', 'price_1' => 120,
            'product_type' => Product::TYPE_MANGA, 'active' => true,
        ]);

        $this->actingAs($this->gerenteA)
            ->putJson("/api/v1/manga-inventory/{$manga->id}/{$this->warehouseB->id}", ['quantity' => 7])
            ->assertForbidden();
    }

    // ── Preventas ─────────────────────────────────────────────────────────────

    public function test_gerente_cannot_create_folio_for_another_store(): void
    {
        $catalog = $this->makeCatalog($this->storeB->id);
        $customer = Customer::create(['name' => 'Cliente X']);

        $this->actingAs($this->gerenteA)
            ->postJson('/api/v1/pre-sale-orders', [
                'store_id'    => $this->storeB->id,
                'customer_id' => $customer->id,
                'items'       => [['catalog_id' => $catalog->id, 'quantity' => 1, 'price_level' => 1]],
            ])
            ->assertForbidden();
    }

    public function test_gerente_cannot_mutate_folio_of_another_store(): void
    {
        $order = $this->makeOrder($this->storeB->id);

        $this->actingAs($this->gerenteA)
            ->postJson("/api/v1/pre-sale-orders/{$order->id}/payments", ['amount' => 10])
            ->assertForbidden();

        $this->actingAs($this->gerenteA)
            ->patchJson("/api/v1/pre-sale-orders/{$order->id}/status", ['status' => 'ready'])
            ->assertForbidden();

        $this->actingAs($this->gerenteA)
            ->postJson("/api/v1/pre-sale-orders/{$order->id}/cancel", [
                'mode' => 'full', 'reason_code' => 'otro',
            ])
            ->assertForbidden();
    }

    // ── Ventas ────────────────────────────────────────────────────────────────

    public function test_gerente_cannot_checkout_against_another_store(): void
    {
        $register = CashRegister::create([
            'store_id' => $this->storeA->id, 'name' => 'Caja A', 'active' => true,
        ]);
        $session = CashRegisterSession::create([
            'register_id' => $register->id, 'user_id' => $this->gerenteA->id,
            'opening_cash' => 0, 'status' => 'open', 'opened_at' => now(),
        ]);
        $cash = PaymentMethod::create(['name' => 'Efectivo', 'active' => true]);

        $this->actingAs($this->gerenteA)
            ->postJson('/api/v1/sales', [
                'store_id'            => $this->storeB->id,
                'register_session_id' => $session->id,
                'items'               => [['product_id' => $this->product->id, 'quantity' => 1, 'price' => 100]],
                'payments'            => [['payment_method_id' => $cash->id, 'amount' => 100]],
            ])
            ->assertForbidden();
    }

    public function test_gerente_cannot_view_or_cancel_sale_of_another_store(): void
    {
        $sale = Sale::create([
            'store_id' => $this->storeB->id, 'user_id' => $this->admin->id,
            'subtotal' => 100, 'discount' => 0, 'total' => 100,
            'status'   => Sale::STATUS_COMPLETED,
        ]);

        $this->actingAs($this->gerenteA)
            ->getJson("/api/v1/sales/{$sale->id}")
            ->assertForbidden();

        $this->actingAs($this->gerenteA)
            ->postJson("/api/v1/sales/{$sale->id}/cancel", ['reason_code' => 'otro'])
            ->assertForbidden();

        $this->actingAs($this->gerenteA)
            ->postJson("/api/v1/sales/{$sale->id}/return")
            ->assertForbidden();
    }

    public function test_gerente_can_view_sale_of_own_store(): void
    {
        $sale = Sale::create([
            'store_id' => $this->storeA->id, 'user_id' => $this->gerenteA->id,
            'subtotal' => 100, 'discount' => 0, 'total' => 100,
            'status'   => Sale::STATUS_COMPLETED,
        ]);

        $this->actingAs($this->gerenteA)
            ->getJson("/api/v1/sales/{$sale->id}")
            ->assertOk();
    }

    // ── Parte 2: reportes anclados + gate de catálogo ────────────────────────

    public function test_gerente_reports_ignore_foreign_store_filter(): void
    {
        Sale::create([
            'store_id' => $this->storeA->id, 'user_id' => $this->gerenteA->id,
            'subtotal' => 100, 'discount' => 0, 'total' => 100,
            'status' => Sale::STATUS_COMPLETED, 'sold_at' => now(),
        ]);
        Sale::create([
            'store_id' => $this->storeB->id, 'user_id' => $this->admin->id,
            'subtotal' => 900, 'discount' => 0, 'total' => 900,
            'status' => Sale::STATUS_COMPLETED, 'sold_at' => now(),
        ]);

        // Aunque pida la tienda B explícitamente, solo ve la suya (A).
        $resp = $this->actingAs($this->gerenteA)
            ->getJson("/api/v1/reports/sales?store_id={$this->storeB->id}")
            ->assertOk();

        $this->assertSame(1, $resp->json('data.summary.total_count'));
        $this->assertSame(100.0, (float) $resp->json('data.summary.total_revenue'));
    }

    public function test_cajero_cannot_update_or_delete_products(): void
    {
        $cajero = $this->makeUser('cajero.a@test.com', 'cajero', $this->storeA->id);

        $this->actingAs($cajero)
            ->putJson("/api/v1/products/{$this->product->id}", ['name' => 'Hackeado'])
            ->assertForbidden();

        $this->actingAs($cajero)
            ->deleteJson("/api/v1/products/{$this->product->id}")
            ->assertForbidden();

        // Gerente sí puede editar
        $this->actingAs($this->gerenteA)
            ->putJson("/api/v1/products/{$this->product->id}", ['name' => 'Editado por gerente'])
            ->assertOk();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

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

    private function makeCatalog(int $storeId): PreSaleCatalog
    {
        $catalog = PreSaleCatalog::create([
            'product_name' => 'Catálogo Test', 'price_1' => 150,
            'status' => PreSaleCatalog::STATUS_PUBLISHED, 'created_by' => $this->admin->id,
        ]);
        $catalog->storeLimits()->create(['store_id' => $storeId, 'limit_qty' => 99]);

        return $catalog;
    }

    private function makeOrder(int $storeId): PreSaleOrder
    {
        $customer = Customer::create(['name' => 'Cliente Folio']);

        return PreSaleOrder::create([
            'code'        => 'PREV-TEST-' . $storeId,
            'store_id'    => $storeId,
            'customer_id' => $customer->id,
            'user_id'     => $this->admin->id,
            'status'      => PreSaleOrder::STATUS_PENDING,
            'total'       => 150,
        ]);
    }
}
