<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\CashRegister;
use App\Models\Company;
use App\Models\Customer;
use App\Models\Inventory;
use App\Models\PaymentMethod;
use App\Models\PreSaleCatalog;
use App\Models\PreSaleOrder;
use App\Models\Product;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\Store;
use App\Models\Terminal;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * QA end-to-end del flujo de ventas vía HTTP (ADR-014 client-authoritative).
 *
 * Cubre: cajas (una por persona, ADR-017), checkout efectivo y tarjeta+terminal,
 * consistencia precio→reporte, cancelación total/parcial (ADR-016), preventas,
 * snapshot de costo (ADR-015) y edge cases de precios/stock.
 *
 * No toca producción — SQLite :memory: vía RefreshDatabase.
 */
class FullSalesQATest extends TestCase
{
    use RefreshDatabase;

    private const TERMINAL_PCT = 3.5;

    private Company $company;
    private Store $store;
    private Warehouse $warehouse;
    private CashRegister $register;
    private PaymentMethod $cash;
    private PaymentMethod $card;
    private Terminal $terminal;
    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();

        $this->company   = Company::create(['name' => 'Tadaima QA Co']);
        $this->store     = Store::create(['company_id' => $this->company->id, 'name' => 'Tienda QA', 'active' => true]);
        $this->warehouse = Warehouse::create([
            'company_id' => $this->company->id, 'store_id' => $this->store->id,
            'name' => 'Bodega QA', 'type' => 'store', 'active' => true,
        ]);
        $this->register = CashRegister::create([
            'store_id' => $this->store->id, 'name' => 'Caja QA', 'active' => true,
        ]);
        $this->cash = PaymentMethod::create(['name' => 'Efectivo', 'allow_cash' => true, 'allow_card' => false, 'active' => true]);
        $this->card = PaymentMethod::create(['name' => 'Tarjeta', 'allow_cash' => false, 'allow_card' => true, 'active' => true]);
        $this->terminal = Terminal::create([
            'store_id' => $this->store->id, 'name' => 'Terminal QA',
            'commission_percent' => self::TERMINAL_PCT, 'active' => true,
        ]);
        $this->customer = Customer::create(['name' => 'Cliente QA']);
    }

    // ───────────────────────────── helpers ─────────────────────────────────────

    private function makeUser(string $email, string $name, string $role): User
    {
        $user = User::create([
            'name' => $name, 'email' => $email, 'password' => bcrypt('x'),
            'company_id' => $this->company->id, 'store_id' => $this->store->id, 'active' => true,
        ]);
        $roleId = DB::table('roles')->where('name', $role)->where('guard_name', 'api')->value('id')
            ?? DB::table('roles')->insertGetId([
                'name' => $role, 'guard_name' => 'api', 'created_at' => now(), 'updated_at' => now(),
            ]);
        DB::table('model_has_roles')->insert([
            'role_id' => $roleId, 'model_type' => User::class, 'model_id' => $user->id,
        ]);
        return $user;
    }

    private function makeProduct(float $cost, float $price1, ?float $price2 = null, ?float $price3 = null, int $qty = 50): Product
    {
        $product = Product::create([
            'company_id' => $this->company->id,
            'name' => 'Producto ' . uniqid(),
            'sku' => 'SKU-' . uniqid(),
            'cost' => $cost, 'active' => true, 'product_type' => Product::TYPE_PRODUCT,
        ]);
        $product->price()->create(array_filter([
            'price_1' => $price1, 'price_2' => $price2, 'price_3' => $price3,
        ], fn ($v) => $v !== null));
        Inventory::create(['product_id' => $product->id, 'warehouse_id' => $this->warehouse->id, 'quantity' => $qty]);
        return $product;
    }

    /** Abre caja para un user vía HTTP y devuelve el register_session_id activo. */
    private function openCash(User $user, float $opening = 0): int
    {
        $this->actingAs($user)
            ->postJson('/api/v1/cash/open', ['register_id' => $this->register->id, 'opening_cash' => $opening])
            ->assertCreated();

        return (int) DB::table('cash_register_sessions')
            ->join('cash_registers', 'cash_registers.id', '=', 'cash_register_sessions.register_id')
            ->where('cash_register_sessions.user_id', $user->id)
            ->where('cash_register_sessions.status', 'open')
            ->value('cash_register_sessions.id');
    }

    private function checkout(User $user, int $sessionId, array $payload): \Illuminate\Testing\TestResponse
    {
        return $this->actingAs($user)->postJson('/api/v1/sales', array_merge([
            'store_id' => $this->store->id,
            'register_session_id' => $sessionId,
        ], $payload));
    }

    // ───────────────────────── A. Cajas ────────────────────────────────────────

    public function test_A_two_users_open_own_caja_same_user_reopen_conflicts(): void
    {
        $cajeroA = $this->makeUser('a@qa.com', 'Ana', 'cajero');
        $cajeroB = $this->makeUser('b@qa.com', 'Beto', 'cajero');

        $this->actingAs($cajeroA)
            ->postJson('/api/v1/cash/open', ['register_id' => $this->register->id, 'opening_cash' => 500])
            ->assertCreated();
        $this->actingAs($cajeroB)
            ->postJson('/api/v1/cash/open', ['register_id' => $this->register->id, 'opening_cash' => 300])
            ->assertCreated();

        $open = DB::table('cash_register_sessions')->where('status', 'open')->count();
        $this->assertSame(2, $open, 'dos cortes propios abiertos en la misma tienda');

        $this->actingAs($cajeroA)
            ->postJson('/api/v1/cash/open', ['register_id' => $this->register->id, 'opening_cash' => 100])
            ->assertStatus(409)
            ->assertJsonPath('conflict', 'own');
    }

    // ───────────────────────── B. Venta efectivo ───────────────────────────────

    public function test_B_cash_sale_totals_cost_snapshot_inventory(): void
    {
        $cajero  = $this->makeUser('c@qa.com', 'Caja', 'cajero');
        $session = $this->openCash($cajero);
        $product = $this->makeProduct(cost: 100.0, price1: 200.0, qty: 10);

        $qty = 3; $price = 200.0; $discount = 50.0;
        $total = round($qty * $price - $discount, 2); // 550

        $res = $this->checkout($cajero, $session, [
            'items'    => [['product_id' => $product->id, 'quantity' => $qty, 'price' => $price]],
            'discount' => $discount,
            'payments' => [['payment_method_id' => $this->cash->id, 'amount' => $total]],
        ])->assertStatus(201);

        $saleId = $res->json('data.id');
        $this->assertSame('completed', $res->json('data.status'));
        $this->assertEquals($total, (float) $res->json('data.total'));
        $this->assertEquals($qty * $price, (float) $res->json('data.subtotal'));
        $this->assertEquals($discount, (float) $res->json('data.discount'));

        $sale = Sale::with('payments')->find($saleId);
        $this->assertEquals($total, round((float) $sale->payments->sum('amount'), 2), 'pago == total');

        $item = SaleItem::where('sale_id', $saleId)->first();
        $this->assertEquals(100.0, (float) $item->cost, 'cost snapshot = product.cost');

        $stock = (float) Inventory::where('product_id', $product->id)->value('quantity');
        $this->assertEquals(10 - $qty, $stock, 'inventario descontado en qty');

        $this->assertSame('venta', DB::table('inventory_movements')
            ->where('product_id', $product->id)->latest('id')->value('type'));
    }

    // ───────────────────────── C. Venta tarjeta + terminal ─────────────────────

    public function test_C_card_terminal_commission_not_charged_to_client(): void
    {
        $cajero  = $this->makeUser('d@qa.com', 'Caja', 'cajero');
        $session = $this->openCash($cajero);
        $product = $this->makeProduct(cost: 50.0, price1: 300.0, qty: 5);

        $total = 300.0;
        $res = $this->checkout($cajero, $session, [
            'items'    => [['product_id' => $product->id, 'quantity' => 1, 'price' => 300.0]],
            'payments' => [['payment_method_id' => $this->card->id, 'amount' => $total, 'terminal_id' => $this->terminal->id]],
        ])->assertStatus(201);

        // Cliente paga SOLO el precio, NO total + comisión.
        $this->assertEquals($total, (float) $res->json('data.total'));
        $payAmount = round((float) Sale::find($res->json('data.id'))->payments->sum('amount'), 2);
        $this->assertEquals($total, $payAmount, 'payment.amount == total (sin comisión sumada al cliente)');

        $expectedCommission = round($total * self::TERMINAL_PCT / 100, 2); // 10.50
        $this->assertEquals($expectedCommission, (float) $res->json('data.commission_amount'),
            'commission_amount = total * 3.5%');
    }

    // ───────────────────────── D. Consistencia precio → reporte ────────────────

    public function test_D_report_revenue_commission_match_sales(): void
    {
        $admin   = $this->makeUser('adm@qa.com', 'Admin', 'admin');
        $cajero  = $this->makeUser('e@qa.com', 'Caja', 'cajero');
        $session = $this->openCash($cajero);
        $p1 = $this->makeProduct(cost: 10, price1: 100, qty: 20);
        $p2 = $this->makeProduct(cost: 20, price1: 250, qty: 20);

        // Venta 1: efectivo 100
        $this->checkout($cajero, $session, [
            'items'    => [['product_id' => $p1->id, 'quantity' => 1, 'price' => 100]],
            'payments' => [['payment_method_id' => $this->cash->id, 'amount' => 100]],
        ])->assertStatus(201);
        // Venta 2: tarjeta+terminal 250 (comisión 8.75)
        $this->checkout($cajero, $session, [
            'items'    => [['product_id' => $p2->id, 'quantity' => 1, 'price' => 250]],
            'payments' => [['payment_method_id' => $this->card->id, 'amount' => 250, 'terminal_id' => $this->terminal->id]],
        ])->assertStatus(201);
        // Venta 3: efectivo 200 con descuento 50 → total 150
        $this->checkout($cajero, $session, [
            'items'    => [['product_id' => $p1->id, 'quantity' => 2, 'price' => 100]],
            'discount' => 50,
            'payments' => [['payment_method_id' => $this->cash->id, 'amount' => 150]],
        ])->assertStatus(201);

        $expectedRevenue    = 100 + 250 + 150; // 500
        $expectedCommission = round(250 * self::TERMINAL_PCT / 100, 2); // 8.75
        $expectedDiscount   = 50;

        $report = $this->actingAs($admin)
            ->getJson('/api/v1/reports/sales?store_id=' . $this->store->id)
            ->assertOk();

        $this->assertSame(3, $report->json('data.summary.total_count'));
        $this->assertEquals($expectedRevenue, (float) $report->json('data.summary.total_revenue'));
        $this->assertEquals($expectedCommission, (float) $report->json('data.summary.total_commission'));
        $this->assertEquals($expectedDiscount, (float) $report->json('data.summary.total_discount'));

        // by_payment_method cuadra: efectivo 100+150=250, tarjeta 250
        $byPm = collect($report->json('data.by_payment_method'))->keyBy('payment_method');
        $this->assertEquals(250, (float) $byPm['Efectivo']['amount']);
        $this->assertEquals(250, (float) $byPm['Tarjeta']['amount']);
        $this->assertEquals($expectedRevenue, $byPm->sum('amount'), 'suma de métodos == revenue');
    }

    // ───────────────────────── E. Cancelación total ────────────────────────────

    public function test_E_full_cancel_restores_stock_excludes_from_report(): void
    {
        $admin   = $this->makeUser('adm2@qa.com', 'Admin', 'admin');
        $session = $this->openCash($admin);
        $product = $this->makeProduct(cost: 80.0, price1: 200.0, qty: 10);

        $res = $this->checkout($admin, $session, [
            'items'    => [['product_id' => $product->id, 'quantity' => 2, 'price' => 200.0]],
            'payments' => [['payment_method_id' => $this->cash->id, 'amount' => 400.0]],
        ])->assertStatus(201);
        $saleId = $res->json('data.id');

        $stockAfterSale = (float) Inventory::where('product_id', $product->id)->value('quantity');
        $this->assertEquals(8, $stockAfterSale);

        $cancel = $this->actingAs($admin)
            ->postJson("/api/v1/sales/{$saleId}/cancel", [
                'reason_code' => 'cliente_devuelve',
                'reason_text' => 'QA cancel total',
                'cash_session_id' => $session,
            ])->assertOk();

        $this->assertEquals(400.0, (float) $cancel->json('data.cancellation.amount_refunded'));
        $this->assertNotNull($cancel->json('data.cancellation.cash_movement_id'));

        $sale = Sale::find($saleId);
        $this->assertSame('returned', $sale->status);

        // Stock restaurado
        $this->assertEquals(10, (float) Inventory::where('product_id', $product->id)->value('quantity'));

        // cash_movement salida == total
        $cm = DB::table('cash_movements')->where('id', $cancel->json('data.cancellation.cash_movement_id'))->first();
        $this->assertSame('salida', $cm->type);
        $this->assertEquals(400.0, (float) $cm->amount);

        // Reporte EXCLUYE la venta cancelada
        $report = $this->actingAs($admin)
            ->getJson('/api/v1/reports/sales?store_id=' . $this->store->id)->assertOk();
        $this->assertSame(0, $report->json('data.summary.total_count'), 'venta returned no cuenta');
        $this->assertEquals(0.0, (float) $report->json('data.summary.total_revenue'));
    }

    // ───────────────────────── F. Cancelación parcial ──────────────────────────

    public function test_F_partial_cancel_recalculates_total_and_report(): void
    {
        $admin   = $this->makeUser('adm3@qa.com', 'Admin', 'admin');
        $session = $this->openCash($admin);
        $product = $this->makeProduct(cost: 30.0, price1: 100.0, qty: 10);

        $res = $this->checkout($admin, $session, [
            'items'    => [['product_id' => $product->id, 'quantity' => 3, 'price' => 100.0]],
            'payments' => [['payment_method_id' => $this->cash->id, 'amount' => 300.0]],
        ])->assertStatus(201);
        $saleId = $res->json('data.id');
        $itemId = collect($res->json('data.items'))->first()['id'];

        $this->actingAs($admin)
            ->postJson("/api/v1/sales/{$saleId}/cancel", [
                'items' => [['sale_item_id' => $itemId, 'quantity' => 1]],
                'reason_code' => 'dañado',
                'cash_session_id' => $session,
            ])->assertOk();

        $sale = Sale::with('items')->find($saleId);
        $this->assertSame('completed', $sale->status, 'sigue completed');
        $this->assertSame('partial', $sale->cancellation_status);
        $this->assertEquals(2, (float) $sale->items->first()->quantity, 'qty 3 → 2');
        $this->assertEquals(200.0, (float) $sale->total, 'total recalculado a 200');

        // Reporte refleja el nuevo total (200, no 300)
        $report = $this->actingAs($admin)
            ->getJson('/api/v1/reports/sales?store_id=' . $this->store->id)->assertOk();
        $this->assertSame(1, $report->json('data.summary.total_count'));
        $this->assertEquals(200.0, (float) $report->json('data.summary.total_revenue'));
    }

    // ───────────────────────── G. Preventa ─────────────────────────────────────

    public function test_G_presale_create_liquidate_rollback_and_report(): void
    {
        $admin   = $this->makeUser('adm4@qa.com', 'Admin', 'admin');
        $session = $this->openCash($admin);
        $product = $this->makeProduct(cost: 70.0, price1: 0.0, qty: 10);

        // Crear PUBLISHED (requisito para crear orden); luego ARRIVED para entregar.
        $catalog = PreSaleCatalog::create([
            'product_name' => 'Manga QA', 'product_id' => $product->id,
            'price_1' => 200.0, 'status' => PreSaleCatalog::STATUS_PUBLISHED,
            'created_by' => $admin->id, 'preorder_limit' => 10,
        ]);
        $catalog->storeLimits()->create(['store_id' => $this->store->id, 'limit_qty' => 10]);

        // Crear orden con anticipo 100 (total = 2 * 200 = 400)
        $create = $this->actingAs($admin)->postJson('/api/v1/pre-sale-orders', [
            'store_id' => $this->store->id,
            'customer_id' => $this->customer->id,
            'items' => [['catalog_id' => $catalog->id, 'quantity' => 2, 'price_level' => 1]],
            'advance_amount' => 100.0,
            'payment_method_id' => $this->cash->id,
        ])->assertStatus(200)->assertJsonPath('success', true);

        $orderId = $create->json('data.id');
        $order   = PreSaleOrder::with(['items', 'payments'])->find($orderId);
        $this->assertEquals(400.0, $order->total);
        $this->assertEquals(100.0, $order->paid_amount);
        $this->assertEquals(300.0, $order->balance);

        // La mercancía llegó: ARRIVED permite marcar items delivered al liquidar.
        $catalog->update(['status' => PreSaleCatalog::STATUS_ARRIVED]);

        // Pasar a ready
        $this->actingAs($admin)
            ->patchJson("/api/v1/pre-sale-orders/{$orderId}/status", ['status' => 'ready'])
            ->assertStatus(200);

        // Liquidación: pagar el saldo 300
        $this->actingAs($admin)
            ->postJson("/api/v1/pre-sale-orders/{$orderId}/payments", ['amount' => 300.0, 'payment_method_id' => $this->cash->id])
            ->assertStatus(200);

        // Entregar (delivered)
        $this->actingAs($admin)
            ->patchJson("/api/v1/pre-sale-orders/{$orderId}/status", ['status' => 'delivered'])
            ->assertStatus(200)
            ->assertJsonPath('data.status', 'delivered');

        $order = PreSaleOrder::with(['items', 'payments'])->find($orderId);
        $this->assertEquals(400.0, $order->paid_amount, 'liquidado: paid == total');
        $this->assertEquals(0.0, $order->balance);

        // pre_sale_summary del reporte cuadra (100 + 300 = 400 cobrado)
        $report = $this->actingAs($admin)
            ->getJson('/api/v1/reports/sales?store_id=' . $this->store->id)->assertOk();
        $this->assertEquals(400.0, (float) $report->json('data.pre_sale_summary.total_amount'));

        // liquidation_rollback: delivered → ready, reversa SOLO la liquidación (300)
        $rollback = $this->actingAs($admin)
            ->postJson("/api/v1/pre-sale-orders/{$orderId}/cancel", [
                'mode' => 'liquidation_rollback',
                'reason_code' => 'error_cajero',
            ])->assertStatus(200);

        $order = PreSaleOrder::with('payments')->find($orderId);
        $this->assertSame('ready', $order->status, 'delivered → ready');
        $this->assertEquals(100.0, $order->paid_amount, 'solo queda el anticipo');
        $this->assertEquals(1, $order->payments->count());
    }

    // ───────────────────────── H. Costo / ganancia gating ──────────────────────

    public function test_H_cost_preserved_and_gated_to_admin_only(): void
    {
        $admin   = $this->makeUser('adm5@qa.com', 'Admin', 'admin');
        $cajero  = $this->makeUser('caj5@qa.com', 'Caja', 'cajero');
        $session = $this->openCash($cajero);
        $product = $this->makeProduct(cost: 60.0, price1: 200.0, qty: 10);

        $res = $this->checkout($cajero, $session, [
            'items'    => [['product_id' => $product->id, 'quantity' => 1, 'price' => 200.0]],
            'payments' => [['payment_method_id' => $this->cash->id, 'amount' => 200.0]],
        ])->assertStatus(201);
        $saleId = $res->json('data.id');

        // Mutar product.cost DESPUÉS de la venta — snapshot debe persistir (ADR-015)
        $product->update(['cost' => 999.0]);
        $this->assertEquals(60.0, (float) SaleItem::where('sale_id', $saleId)->value('cost'));

        // Admin ve el cost en sale_items
        $adminView = $this->actingAs($admin)->getJson("/api/v1/sales/{$saleId}")->assertOk();
        $this->assertEquals(60.0, (float) $adminView->json('data.items.0.cost'),
            'admin ve cost snapshot (60), no el product.cost mutado');

        // Cajero NO ve el cost (gateado admin-only en SaleItemResource)
        $cajeroView = $this->actingAs($cajero)->getJson("/api/v1/sales/{$saleId}")->assertOk();
        $this->assertNull($cajeroView->json('data.items.0.cost'),
            'cajero no debe ver cost en sale_items');
    }

    // ───────────────────────── I. Edge cases de precios/stock ──────────────────

    public function test_I1_discount_greater_than_subtotal_is_rejected(): void
    {
        $cajero  = $this->makeUser('caj6@qa.com', 'Caja', 'cajero');
        $session = $this->openCash($cajero);
        $product = $this->makeProduct(cost: 10, price1: 100, qty: 5);

        // subtotal 100, descuento 150 → total negativo. payment 0 no permitido (min 0.01),
        // así que mandamos payment que iguale un total imposible: el service debe rechazar.
        $this->checkout($cajero, $session, [
            'items'    => [['product_id' => $product->id, 'quantity' => 1, 'price' => 100]],
            'discount' => 150,
            'payments' => [['payment_method_id' => $this->cash->id, 'amount' => 0.01]],
        ])->assertStatus(422);
    }

    public function test_I2_payments_not_matching_total_is_rejected(): void
    {
        $cajero  = $this->makeUser('caj7@qa.com', 'Caja', 'cajero');
        $session = $this->openCash($cajero);
        $product = $this->makeProduct(cost: 10, price1: 100, qty: 5);

        // total 100, pago 90 → mismatch → 422
        $this->checkout($cajero, $session, [
            'items'    => [['product_id' => $product->id, 'quantity' => 1, 'price' => 100]],
            'payments' => [['payment_method_id' => $this->cash->id, 'amount' => 90]],
        ])->assertStatus(422);
    }

    public function test_I3_overselling_stock_is_rejected(): void
    {
        $cajero  = $this->makeUser('caj8@qa.com', 'Caja', 'cajero');
        $session = $this->openCash($cajero);
        $product = $this->makeProduct(cost: 10, price1: 100, qty: 2);

        $res = $this->checkout($cajero, $session, [
            'items'    => [['product_id' => $product->id, 'quantity' => 5, 'price' => 100]],
            'payments' => [['payment_method_id' => $this->cash->id, 'amount' => 500]],
        ])->assertStatus(422);

        $this->assertStringContainsString('Stock insuficiente', (string) $res->json('error'));
        // Stock intacto, no quedó draft completado vendiendo de menos
        $this->assertEquals(2, (float) Inventory::where('product_id', $product->id)->value('quantity'));
    }

    public function test_I4_price_levels_b_and_c_use_client_price(): void
    {
        // El precio de cada nivel del catálogo (price_2/price_3) es válido y se
        // respeta tal cual. El guard de precios (2026-05-30) acepta cualquier
        // nivel definido; price_level es metadata.
        $cajero  = $this->makeUser('caj9@qa.com', 'Caja', 'cajero');
        $session = $this->openCash($cajero);
        $product = $this->makeProduct(cost: 10, price1: 100, price2: 90, price3: 80, qty: 10);

        // price_level 'b' → cliente manda price 90
        $resB = $this->checkout($cajero, $session, [
            'items'    => [['product_id' => $product->id, 'quantity' => 1, 'price' => 90, 'price_level' => 'b']],
            'payments' => [['payment_method_id' => $this->cash->id, 'amount' => 90]],
        ])->assertStatus(201);
        $this->assertEquals(90.0, (float) $resB->json('data.total'));

        // price_level 'c' → cliente manda price 80
        $resC = $this->checkout($cajero, $session, [
            'items'    => [['product_id' => $product->id, 'quantity' => 1, 'price' => 80, 'price_level' => 'c']],
            'payments' => [['payment_method_id' => $this->cash->id, 'amount' => 80]],
        ])->assertStatus(201);
        $this->assertEquals(80.0, (float) $resC->json('data.total'));
    }

    public function test_I5_off_catalog_price_is_rejected_unless_damaged(): void
    {
        // Guard de precios (2026-05-30): un precio que no coincide con ningún
        // nivel del catálogo se rechaza (cierra el riesgo de vender a $1 un
        // producto de $100 por bug/manipulación del cliente). Excepción: si el
        // item viene marcado is_damaged, se permite precio manual.
        $cajero  = $this->makeUser('caj10@qa.com', 'Caja', 'cajero');
        $session = $this->openCash($cajero);
        $product = $this->makeProduct(cost: 10, price1: 100, qty: 10);

        // No dañado, price=1 fuera del catálogo → 422.
        $rejected = $this->checkout($cajero, $session, [
            'items'    => [['product_id' => $product->id, 'quantity' => 1, 'price' => 1]],
            'payments' => [['payment_method_id' => $this->cash->id, 'amount' => 1]],
        ])->assertStatus(422);
        $this->assertStringContainsString('fuera del catálogo', (string) $rejected->json('error'));

        // Stock intacto (no se vendió).
        $this->assertEquals(10, (float) Inventory::where('product_id', $product->id)->value('quantity'));

        // Mismo precio bajo PERO marcado dañado → permitido (precio manual).
        $okDamaged = $this->checkout($cajero, $session, [
            'items'    => [['product_id' => $product->id, 'quantity' => 1, 'price' => 1, 'is_damaged' => true]],
            'payments' => [['payment_method_id' => $this->cash->id, 'amount' => 1]],
        ])->assertStatus(201);
        $this->assertEquals(1.0, (float) $okDamaged->json('data.total'));
    }

    public function test_I6_store_override_price_is_accepted(): void
    {
        // Precio por tienda (product_store_prices) sobrescribe el base; debe
        // aceptarse aunque no coincida con price_1..5 del catálogo base.
        $cajero  = $this->makeUser('caj11@qa.com', 'Caja', 'cajero');
        $session = $this->openCash($cajero);
        $product = $this->makeProduct(cost: 10, price1: 100, qty: 10);
        $product->storePrices()->create([
            'store_id' => $this->store->id, 'price_level' => 1, 'price' => 85,
        ]);

        // Precio por tienda 85 → aceptado.
        $this->checkout($cajero, $session, [
            'items'    => [['product_id' => $product->id, 'quantity' => 1, 'price' => 85]],
            'payments' => [['payment_method_id' => $this->cash->id, 'amount' => 85]],
        ])->assertStatus(201);
    }
}
