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
use App\Models\Store;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Eliminar producto CON ventas (Joel 2026-08-18).
 *
 * Escenario del cliente: "hoy vendo 1 booster en $100, ya no tendré más y no
 * quiero el registro — borro el producto, pero la venta debe seguir apareciendo
 * en el reporte semanal/mensual". Antes: DELETE /products bloqueaba con 422
 * ("Puedes desactivarlo") y el force (solo admin) dejaba la línea huérfana
 * (product_id NULL sin nombre → "Artículo Desconocido").
 *
 * Ahora `sale_items` guarda snapshot `product_name`/`product_sku` al momento
 * del checkout (espíritu ADR-015, como `cost`) y el DELETE normal permite
 * borrar con ventas: la venta conserva nombre/sku/precio/costo/cantidad y
 * expone `product_deleted: true` como flag.
 */
class ProductDeleteWithSalesTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;
    private Store $store;
    private Warehouse $warehouse;
    private User $admin;
    private CashRegisterSession $session;
    private PaymentMethod $cashMethod;

    protected function setUp(): void
    {
        parent::setUp();

        $this->company = Company::create(['name' => 'Test Co']);
        $this->store = Store::create(['company_id' => $this->company->id, 'name' => 'Test Store']);
        $this->warehouse = Warehouse::create([
            'company_id' => $this->company->id, 'store_id' => $this->store->id,
            'name' => 'Exhibición', 'type' => 'store', 'active' => true,
        ]);
        $this->admin = User::create([
            'name' => 'Admin', 'email' => 'admin@test.com', 'password' => bcrypt('x'),
            'company_id' => $this->company->id, 'store_id' => $this->store->id, 'active' => true,
        ]);
        $roleId = DB::table('roles')->where('name', 'admin')->value('id')
            ?? DB::table('roles')->insertGetId([
                'name' => 'admin', 'guard_name' => 'api',
                'created_at' => now(), 'updated_at' => now(),
            ]);
        DB::table('model_has_roles')->insert([
            'role_id' => $roleId, 'model_type' => User::class, 'model_id' => $this->admin->id,
        ]);

        $register = CashRegister::create(['store_id' => $this->store->id, 'name' => 'Caja 1', 'active' => true]);
        $this->session = CashRegisterSession::create([
            'register_id' => $register->id, 'user_id' => $this->admin->id,
            'opening_cash' => 0, 'status' => 'open', 'opened_at' => now(),
        ]);
        $this->cashMethod = PaymentMethod::firstOrCreate(['name' => 'Efectivo'], ['active' => true]);
    }

    private function makeProduct(string $name = 'Booster Pitch Black', float $price = 100.0, float $cost = 40.0): Product
    {
        $product = Product::create([
            'company_id' => $this->company->id,
            'name' => $name, 'sku' => 'SKU-' . uniqid(),
            'cost' => $cost, 'active' => true,
        ]);
        $product->price()->create(['price_1' => $price]);
        Inventory::create(['product_id' => $product->id, 'warehouse_id' => $this->warehouse->id, 'quantity' => 10]);

        return $product;
    }

    /** Venta real vía checkout (POST /sales) de 1 unidad. */
    private function sellOne(Product $product, float $price = 100.0): Sale
    {
        $resp = $this->actingAs($this->admin)->postJson('/api/v1/sales', [
            'store_id' => $this->store->id,
            'register_session_id' => $this->session->id,
            'items' => [['product_id' => $product->id, 'quantity' => 1, 'price' => $price]],
            'payments' => [['payment_method_id' => $this->cashMethod->id, 'amount' => $price]],
        ]);
        $resp->assertStatus(201);

        return Sale::latest('id')->first();
    }

    // ─── Snapshot al vender ──────────────────────────────────────────────────

    public function test_checkout_guarda_snapshot_de_nombre_y_sku(): void
    {
        $product = $this->makeProduct();
        $sale = $this->sellOne($product);

        $item = SaleItem::where('sale_id', $sale->id)->firstOrFail();
        $this->assertSame('Booster Pitch Black', $item->product_name);
        $this->assertSame($product->sku, $item->product_sku);
    }

    // ─── Eliminar con ventas ─────────────────────────────────────────────────

    public function test_delete_con_ventas_ya_no_bloquea_y_la_venta_conserva_todo(): void
    {
        $product = $this->makeProduct();
        $sale = $this->sellOne($product);
        $sku = $product->sku;

        $this->actingAs($this->admin)
            ->deleteJson("/api/v1/products/{$product->id}")
            ->assertOk();

        $this->assertDatabaseMissing('products', ['id' => $product->id]);

        // La venta sigue COMPLETA: monto, cantidad, costo y el nombre snapshot.
        $item = SaleItem::where('sale_id', $sale->id)->firstOrFail();
        $this->assertNull($item->product_id);
        $this->assertSame('Booster Pitch Black', $item->product_name);
        $this->assertSame($sku, $item->product_sku);
        $this->assertSame(100.0, $item->total);
        $this->assertSame(40.0, $item->cost);

        $this->assertSame(100.0, (float) $sale->fresh()->total);
    }

    public function test_venta_de_producto_borrado_expone_nombre_y_flag_en_el_api(): void
    {
        $product = $this->makeProduct();
        $sale = $this->sellOne($product);

        $this->actingAs($this->admin)->deleteJson("/api/v1/products/{$product->id}")->assertOk();

        $data = $this->actingAs($this->admin)
            ->getJson("/api/v1/sales/{$sale->id}")
            ->assertOk()->json('data');

        $item = $data['items'][0];
        $this->assertSame('Booster Pitch Black', $item['product_name']);
        $this->assertTrue($item['product_deleted']);
        $this->assertArrayNotHasKey('product', $item);
    }

    public function test_delete_rellena_snapshot_de_ventas_viejas_sin_el(): void
    {
        // Venta pre-migración: fila sin snapshot (insert directo).
        $product = $this->makeProduct('Producto Legacy');
        $sale = Sale::create([
            'store_id' => $this->store->id, 'register_session_id' => $this->session->id,
            'user_id' => $this->admin->id, 'subtotal' => 100, 'discount' => 0,
            'total' => 100, 'status' => Sale::STATUS_COMPLETED,
        ]);
        SaleItem::create([
            'sale_id' => $sale->id, 'product_id' => $product->id,
            'quantity' => 1, 'price' => 100, 'total' => 100, 'cost' => 40,
        ]);
        DB::table('sale_items')->where('sale_id', $sale->id)
            ->update(['product_name' => null, 'product_sku' => null]);

        $this->actingAs($this->admin)->deleteJson("/api/v1/products/{$product->id}")->assertOk();

        $item = SaleItem::where('sale_id', $sale->id)->firstOrFail();
        $this->assertSame('Producto Legacy', $item->product_name);
    }

    public function test_delete_sigue_bloqueando_con_apartados(): void
    {
        $product = $this->makeProduct();
        $customerId = DB::table('customers')->insertGetId([
            'name' => 'Cliente', 'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('layaways')->insert([
            'code' => 'AP-TEST-0001', 'store_id' => $this->store->id,
            'user_id' => $this->admin->id, 'customer_id' => $customerId,
            'product_id' => $product->id, 'quantity' => 1, 'price' => 100,
            'total' => 100, 'down_payment' => 50, 'status' => 'active',
            'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->actingAs($this->admin)
            ->deleteJson("/api/v1/products/{$product->id}")
            ->assertStatus(422);

        $this->assertDatabaseHas('products', ['id' => $product->id]);
    }

    public function test_manga_con_ventas_tambien_se_borra_conservando_la_venta(): void
    {
        $manga = Product::create([
            'company_id' => $this->company->id,
            'name' => 'Tomo 1 One Piece', 'sku' => 'MANGA-' . uniqid(),
            'cost' => 50, 'active' => true, 'product_type' => Product::TYPE_MANGA,
        ]);
        $manga->price()->create(['price_1' => 250]);
        Inventory::create(['product_id' => $manga->id, 'warehouse_id' => $this->warehouse->id, 'quantity' => 5]);
        $sale = $this->sellOne($manga, 250.0);

        $this->actingAs($this->admin)
            ->deleteJson("/api/v1/mangas/{$manga->id}")
            ->assertOk();

        $this->assertDatabaseMissing('products', ['id' => $manga->id]);
        $item = SaleItem::where('sale_id', $sale->id)->firstOrFail();
        $this->assertSame('Tomo 1 One Piece', $item->product_name);
    }

    // ─── Reportes ────────────────────────────────────────────────────────────

    public function test_top_products_incluye_el_producto_borrado_con_su_nombre(): void
    {
        $product = $this->makeProduct();
        $this->sellOne($product);
        $this->actingAs($this->admin)->deleteJson("/api/v1/products/{$product->id}")->assertOk();

        $rows = $this->actingAs($this->admin)
            ->getJson('/api/v1/reports/top-products?from=' . now()->subDay()->toDateString() . '&to=' . now()->addDay()->toDateString())
            ->assertOk()->json('data');

        $names = collect($rows['data'])->pluck('name')->all();
        $this->assertContains('Booster Pitch Black', $names);
    }

    public function test_corte_muestra_el_nombre_del_producto_borrado_en_tickets(): void
    {
        $product = $this->makeProduct();
        $this->sellOne($product);
        $this->actingAs($this->admin)->deleteJson("/api/v1/products/{$product->id}")->assertOk();

        $data = $this->actingAs($this->admin)
            ->getJson("/api/v1/reports/cash/{$this->session->id}/detail")
            ->assertOk()->json('data');

        $tickets = $data['tickets'];
        $this->assertNotEmpty($tickets);
        $this->assertSame('Booster Pitch Black', $tickets[0]['items'][0]['name']);
        $this->assertNotNull($tickets[0]['items'][0]['sku']);
    }

    // ─── Cancelación después del borrado ─────────────────────────────────────

    public function test_cancelar_venta_de_producto_borrado_no_truena_y_usa_el_snapshot(): void
    {
        $product = $this->makeProduct();
        $sale = $this->sellOne($product);
        $this->actingAs($this->admin)->deleteJson("/api/v1/products/{$product->id}")->assertOk();

        $resp = $this->actingAs($this->admin)->postJson("/api/v1/sales/{$sale->id}/cancel", [
            'items' => [],
            'reason_code' => 'cliente_devuelve',
        ]);
        $resp->assertOk();

        $snapshot = DB::table('sale_cancellations')->where('sale_id', $sale->id)->value('items_snapshot');
        $this->assertStringContainsString('Booster Pitch Black', (string) $snapshot);
    }
}
