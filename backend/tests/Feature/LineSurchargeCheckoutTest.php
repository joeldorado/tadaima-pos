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
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\Store;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Aumento de precio por línea (2026-09-29, pedido del cliente vía Joel).
 *
 * Espejo del descuento por línea pero hacia arriba: el cajero manda
 * kind/basis/value/reason en `items.*.line_surcharge`; el backend calcula el
 * monto (SaleCalculator), lo guarda en sale_items.surcharge_* y lo suma en
 * sales.surcharge. total = subtotal − discount + surcharge. El precio unitario
 * sigue siendo el del catálogo (el guard de precios no cambia).
 */
class LineSurchargeCheckoutTest extends TestCase
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
            'name' => 'Exhibición', 'type' => 'store', 'active' => true,
        ]);
        $register = CashRegister::create(['store_id' => $this->store->id, 'name' => 'Caja 1', 'active' => true]);
        $this->session = CashRegisterSession::create([
            'register_id' => $register->id, 'user_id' => $this->user->id,
            'opening_cash' => 0, 'status' => 'open', 'opened_at' => now(),
        ]);
        $this->cashMethod = PaymentMethod::firstOrCreate(['name' => 'Efectivo'], ['active' => true]);
    }

    private function makeProduct(float $price): Product
    {
        $warehouse = Warehouse::where('store_id', $this->store->id)->first();
        $product = Product::create([
            'company_id' => $this->store->company_id,
            'name' => 'Producto ' . uniqid(), 'sku' => 'SKU-' . uniqid(),
            'cost' => 40, 'active' => true,
        ]);
        $product->price()->create(['price_1' => $price]);
        Inventory::create(['product_id' => $product->id, 'warehouse_id' => $warehouse->id, 'quantity' => 100]);

        return $product;
    }

    private function surcharge(string $kind, string $basis, float $value, string $reason = 'precio_especial', ?string $note = null): array
    {
        return array_filter(
            ['kind' => $kind, 'basis' => $basis, 'value' => $value, 'reason' => $reason, 'note' => $note],
            static fn ($v) => $v !== null,
        );
    }

    private function checkout(array $items, float $paymentAmount, array $extra = []): \Illuminate\Testing\TestResponse
    {
        return $this->actingAs($this->user)->postJson('/api/v1/sales', array_merge([
            'store_id'            => $this->store->id,
            'register_session_id' => $this->session->id,
            'calc_version'        => 2,
            'items'               => $items,
            'payments'            => [['payment_method_id' => $this->cashMethod->id, 'amount' => $paymentAmount]],
        ], $extra));
    }

    public function test_fixed_per_unit_surcharge_is_stored_and_charged(): void
    {
        // 2 uds de $100 cobradas a $150 c/u → +$50 × 2 = +$100 → total $300.
        $product = $this->makeProduct(100);

        $this->checkout([
            ['product_id' => $product->id, 'quantity' => 2, 'price' => 100.0,
             'line_surcharge' => $this->surcharge('fixed', 'unit', 50, 'escasez', 'última pieza en la ciudad')],
        ], 300.0)
            ->assertStatus(201)
            ->assertJsonPath('data.subtotal', 200)
            ->assertJsonPath('data.discount', 0)
            ->assertJsonPath('data.surcharge', 100)
            ->assertJsonPath('data.total', 300);

        $sale = Sale::latest('id')->first();
        $item = SaleItem::where('sale_id', $sale->id)->first();

        // Precio de catálogo intacto; el aumento vive en sus columnas.
        $this->assertSame(100.0, (float) $item->price);
        $this->assertSame(200.0, (float) $item->total);
        $this->assertSame(0.0, (float) $item->discount_amount);
        $this->assertNull($item->benefit_type);
        $this->assertSame('fixed', $item->surcharge_kind);
        $this->assertSame('unit', $item->surcharge_basis);
        $this->assertSame(50.0, (float) $item->surcharge_value);
        $this->assertSame(100.0, (float) $item->surcharge_amount);
        $this->assertSame('escasez', $item->surcharge_reason);
        $this->assertSame('última pieza en la ciudad', $item->surcharge_note);
        $this->assertSame($this->user->id, (int) $item->surcharge_authorized_by);

        // Invariante: total = subtotal − discount + surcharge.
        $this->assertSame(300.0, (float) $sale->subtotal - (float) $sale->discount + (float) $sale->surcharge);
    }

    public function test_fixed_per_line_surcharge(): void
    {
        $product = $this->makeProduct(100);

        $this->checkout([
            ['product_id' => $product->id, 'quantity' => 2, 'price' => 100.0,
             'line_surcharge' => $this->surcharge('fixed', 'line', 200, 'envio')],
        ], 400.0)
            ->assertStatus(201)
            ->assertJsonPath('data.surcharge', 200)
            ->assertJsonPath('data.total', 400);
    }

    public function test_percent_surcharge(): void
    {
        $product = $this->makeProduct(100);

        $this->checkout([
            ['product_id' => $product->id, 'quantity' => 2, 'price' => 100.0,
             'line_surcharge' => $this->surcharge('percent', 'line', 10)],
        ], 220.0)
            ->assertStatus(201)
            ->assertJsonPath('data.surcharge', 20)
            ->assertJsonPath('data.total', 220);
    }

    public function test_split_line_only_surcharges_its_units(): void
    {
        // Mismo producto en 2 líneas: 1 a precio normal + 2 con +$50 c/u.
        $product = $this->makeProduct(100);

        $this->checkout([
            ['product_id' => $product->id, 'quantity' => 1, 'price' => 100.0],
            ['product_id' => $product->id, 'quantity' => 2, 'price' => 100.0,
             'line_surcharge' => $this->surcharge('fixed', 'unit', 50)],
        ], 400.0)
            ->assertStatus(201)
            ->assertJsonPath('data.subtotal', 300)
            ->assertJsonPath('data.surcharge', 100)
            ->assertJsonPath('data.total', 400);

        $items = SaleItem::orderBy('id')->get();
        $this->assertSame(0.0, (float) $items[0]->surcharge_amount);
        $this->assertNull($items[0]->surcharge_reason);
        $this->assertSame(100.0, (float) $items[1]->surcharge_amount);
        $this->assertSame(97.0, (float) Inventory::where('product_id', $product->id)->sum('quantity'));
    }

    public function test_percent_surcharge_applies_after_promo(): void
    {
        // 2 uds @ $50 con 2x1 → neto-promo $50; +10% sobre $50 = $5 → $55.
        $product = $this->makeProduct(50);
        ProductPromotion::create(['product_id' => $product->id, 'name' => '2x1', 'buy_n' => 2, 'pay_m' => 1]);

        $this->checkout([
            ['product_id' => $product->id, 'quantity' => 2, 'price' => 50.0,
             'line_surcharge' => $this->surcharge('percent', 'line', 10)],
        ], 55.0)
            ->assertStatus(201)
            ->assertJsonPath('data.discount', 50)
            ->assertJsonPath('data.surcharge', 5)
            ->assertJsonPath('data.total', 55);

        $item = SaleItem::first();
        $this->assertSame('promo', $item->benefit_type);
        $this->assertSame(50.0, (float) $item->discount_amount);
        $this->assertSame(5.0, (float) $item->surcharge_amount);
    }

    public function test_fixed_surcharge_on_promo_line(): void
    {
        // El aumento fijo se suma aunque la promo haya regalado una pieza.
        $product = $this->makeProduct(50);
        ProductPromotion::create(['product_id' => $product->id, 'name' => '2x1', 'buy_n' => 2, 'pay_m' => 1]);

        $this->checkout([
            ['product_id' => $product->id, 'quantity' => 2, 'price' => 50.0,
             'line_surcharge' => $this->surcharge('fixed', 'line', 30, 'envio')],
        ], 80.0)
            ->assertStatus(201)
            ->assertJsonPath('data.discount', 50)
            ->assertJsonPath('data.surcharge', 30)
            ->assertJsonPath('data.total', 80);
    }

    public function test_discount_and_surcharge_on_different_lines_roll_up_separately(): void
    {
        // A: $100 −$10 (dañado) · B: $100 +$20 (precio especial) → $210.
        // sales.discount NO se come el aumento (trampa del rollup subtotal − Σneto).
        $a = $this->makeProduct(100);
        $b = $this->makeProduct(100);

        $this->checkout([
            ['product_id' => $a->id, 'quantity' => 1, 'price' => 100.0,
             'line_discount' => ['kind' => 'fixed', 'basis' => 'unit', 'value' => 10, 'reason' => 'danado']],
            ['product_id' => $b->id, 'quantity' => 1, 'price' => 100.0,
             'line_surcharge' => $this->surcharge('fixed', 'unit', 20)],
        ], 210.0)
            ->assertStatus(201)
            ->assertJsonPath('data.subtotal', 200)
            ->assertJsonPath('data.discount', 10)
            ->assertJsonPath('data.surcharge', 20)
            ->assertJsonPath('data.total', 210);
    }

    public function test_payment_that_ignores_the_surcharge_is_rejected(): void
    {
        $product = $this->makeProduct(100);

        $this->checkout([
            ['product_id' => $product->id, 'quantity' => 1, 'price' => 100.0,
             'line_surcharge' => $this->surcharge('fixed', 'unit', 50)],
        ], 100.0)->assertStatus(422);

        $this->assertSame(0, Sale::count());
    }

    public function test_mixed_payment_covers_the_surcharged_total(): void
    {
        $transfer = PaymentMethod::firstOrCreate(['name' => 'Transferencia'], ['active' => true]);
        $product = $this->makeProduct(100);

        $this->checkout([
            ['product_id' => $product->id, 'quantity' => 1, 'price' => 100.0,
             'line_surcharge' => $this->surcharge('fixed', 'unit', 50)],
        ], 0, ['payments' => [
            ['payment_method_id' => $this->cashMethod->id, 'amount' => 100.0],
            ['payment_method_id' => $transfer->id, 'amount' => 50.0],
        ]])
            ->assertStatus(201)
            ->assertJsonPath('data.total', 150);
    }

    public function test_line_cannot_have_discount_and_surcharge(): void
    {
        $product = $this->makeProduct(100);

        $this->checkout([
            ['product_id' => $product->id, 'quantity' => 1, 'price' => 100.0,
             'line_discount' => ['kind' => 'fixed', 'basis' => 'unit', 'value' => 10, 'reason' => 'danado'],
             'line_surcharge' => $this->surcharge('fixed', 'unit', 20)],
        ], 110.0)
            ->assertStatus(422)
            ->assertJsonValidationErrors(['items.0.line_surcharge']);
    }

    public function test_surcharge_requires_calc_v2(): void
    {
        // Sin calc_version el calculador no corre: el aumento se perdería en
        // silencio → se rechaza.
        $product = $this->makeProduct(100);

        $this->actingAs($this->user)->postJson('/api/v1/sales', [
            'store_id'            => $this->store->id,
            'register_session_id' => $this->session->id,
            'items'               => [['product_id' => $product->id, 'quantity' => 1, 'price' => 100.0,
                'line_surcharge' => $this->surcharge('fixed', 'unit', 20)]],
            'payments'            => [['payment_method_id' => $this->cashMethod->id, 'amount' => 120.0]],
        ])->assertStatus(422);
    }

    public function test_invalid_surcharges_are_rejected(): void
    {
        $product = $this->makeProduct(100);
        $line = fn (array $s) => [['product_id' => $product->id, 'quantity' => 1, 'price' => 100.0, 'line_surcharge' => $s]];

        $this->checkout($line($this->surcharge('percent', 'line', 150)), 250.0)
            ->assertStatus(422)->assertJsonValidationErrors(['items.0.line_surcharge.value']);
        $this->checkout($line($this->surcharge('fixed', 'unit', 0)), 100.0)
            ->assertStatus(422)->assertJsonValidationErrors(['items.0.line_surcharge.value']);
        $this->checkout($line($this->surcharge('fixed', 'unit', 20, 'danado')), 120.0)
            ->assertStatus(422)->assertJsonValidationErrors(['items.0.line_surcharge.reason']);

        $this->assertSame(0, Sale::count());
    }

    public function test_damaged_items_cannot_be_surcharged(): void
    {
        $product = $this->makeProduct(100);

        $this->checkout([
            ['product_id' => $product->id, 'quantity' => 1, 'price' => 60.0, 'is_damaged' => true,
             'line_surcharge' => $this->surcharge('fixed', 'unit', 20)],
        ], 80.0)
            ->assertStatus(422)
            ->assertJsonValidationErrors(['items.0.line_surcharge']);
    }

    public function test_resources_expose_surcharge_fields(): void
    {
        $product = $this->makeProduct(100);

        $this->checkout([
            ['product_id' => $product->id, 'quantity' => 1, 'price' => 100.0,
             'line_surcharge' => $this->surcharge('fixed', 'unit', 25, 'otro', 'pedido especial')],
        ], 125.0)->assertStatus(201);

        $sale = Sale::latest('id')->first();

        $this->actingAs($this->user)
            ->getJson("/api/v1/sales/{$sale->id}")
            ->assertOk()
            ->assertJsonPath('data.surcharge', 25)
            ->assertJsonPath('data.items.0.surcharge_amount', 25)
            ->assertJsonPath('data.items.0.surcharge_kind', 'fixed')
            ->assertJsonPath('data.items.0.surcharge_basis', 'unit')
            ->assertJsonPath('data.items.0.surcharge_value', 25)
            ->assertJsonPath('data.items.0.surcharge_reason', 'otro')
            ->assertJsonPath('data.items.0.surcharge_note', 'pedido especial');
    }

    public function test_sales_without_surcharge_expose_zero(): void
    {
        $product = $this->makeProduct(100);

        $this->checkout([['product_id' => $product->id, 'quantity' => 1, 'price' => 100.0]], 100.0)
            ->assertStatus(201)
            ->assertJsonPath('data.surcharge', 0)
            ->assertJsonPath('data.items.0.surcharge_amount', 0);
    }

    private function makeAdmin(): User
    {
        $admin = User::create([
            'name' => 'Admin', 'email' => 'admin@test.com', 'password' => bcrypt('x'),
            'company_id' => $this->store->company_id, 'store_id' => $this->store->id, 'active' => true,
        ]);
        $roleId = \Illuminate\Support\Facades\DB::table('roles')->where('name', 'admin')->value('id')
            ?? \Illuminate\Support\Facades\DB::table('roles')->insertGetId([
                'name' => 'admin', 'guard_name' => 'api', 'created_at' => now(), 'updated_at' => now(),
            ]);
        \Illuminate\Support\Facades\DB::table('model_has_roles')->insert([
            'role_id' => $roleId, 'model_type' => User::class, 'model_id' => $admin->id,
        ]);

        return $admin;
    }

    public function test_reports_include_surcharges(): void
    {
        // A: $100 +$50 (solo aumento) · B: 2 × $100 −$20 c/u. Total $310.
        $a = $this->makeProduct(100);
        $b = $this->makeProduct(100);
        $this->checkout([
            ['product_id' => $a->id, 'quantity' => 1, 'price' => 100.0,
             'line_surcharge' => $this->surcharge('fixed', 'unit', 50)],
            ['product_id' => $b->id, 'quantity' => 2, 'price' => 100.0,
             'line_discount' => ['kind' => 'fixed', 'basis' => 'unit', 'value' => 20, 'reason' => 'danado']],
        ], 310.0)->assertStatus(201);

        $admin = $this->makeAdmin();
        $range = 'from=' . now()->subDay()->toDateString() . '&to=' . now()->addDay()->toDateString();

        $summary = $this->actingAs($admin)->getJson("/api/v1/reports/sales?{$range}")->assertOk()->json('data.summary');
        $this->assertEquals(310.0, $summary['total_revenue']);
        $this->assertEquals(40.0, $summary['total_discount']);
        $this->assertEquals(50.0, $summary['total_surcharge']);

        // Top productos: ingreso NETO por línea (antes se prorrateaba por venta).
        $rows = collect($this->actingAs($admin)->getJson("/api/v1/reports/top-products?{$range}")->assertOk()->json('data.data'));
        $this->assertEquals(150.0, (float) $rows->firstWhere('id', $a->id)['total_revenue']);
        $this->assertEquals(160.0, (float) $rows->firstWhere('id', $b->id)['total_revenue']);

        // Detalle del corte: aumento por ticket y neto por renglón.
        $ticket = $this->actingAs($admin)->getJson("/api/v1/reports/cash/{$this->session->id}/detail")
            ->assertOk()->json('data.tickets.0');
        $this->assertEquals(50.0, $ticket['surcharge']);
        $this->assertEquals(150.0, $ticket['items'][0]['net']);
        $this->assertEquals(160.0, $ticket['items'][1]['net']);
    }

    public function test_surcharge_migrations_are_idempotent(): void
    {
        foreach (glob(database_path('migrations/2026_09_29_*_surcharge*.php')) as $file) {
            $migration = require $file;
            $migration->up();
        }

        $this->assertTrue(\Illuminate\Support\Facades\Schema::hasColumns('sale_items', [
            'surcharge_kind', 'surcharge_basis', 'surcharge_value', 'surcharge_amount',
            'surcharge_reason', 'surcharge_note', 'surcharge_authorized_by',
        ]));
        $this->assertTrue(\Illuminate\Support\Facades\Schema::hasColumn('sales', 'surcharge'));
    }
}
