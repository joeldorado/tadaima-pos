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
use Tests\TestCase;

/**
 * Descuentos v2 — Fase 1 (2026-07-14): descuento POR LÍNEA con recompute
 * server-side (SaleCalculator). El cliente manda kind/basis/value/reason en
 * `items.*.line_discount` + `calc_version: 2`; el backend calcula el monto,
 * lo persiste por línea (sale_items.discount_amount + metadata) y hace el
 * rollup en sales.discount. El monto del cliente NUNCA se acepta.
 */
class LineDiscountCheckoutTest extends TestCase
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

    private function makeProduct(float $price, float $cost = 50): Product
    {
        $warehouse = Warehouse::where('store_id', $this->store->id)->first();
        $product = Product::create([
            'company_id' => $this->store->company_id,
            'name' => 'Producto ' . uniqid(), 'sku' => 'SKU-' . uniqid(),
            'cost' => $cost, 'active' => true,
        ]);
        $product->price()->create(['price_1' => $price]);
        Inventory::create(['product_id' => $product->id, 'warehouse_id' => $warehouse->id, 'quantity' => 100]);
        return $product;
    }

    private function checkoutPayload(array $items, float $paymentAmount): array
    {
        return [
            'store_id'            => $this->store->id,
            'register_session_id' => $this->session->id,
            'calc_version'        => 2,
            'items'               => $items,
            'payments'            => [['payment_method_id' => $this->cashMethod->id, 'amount' => $paymentAmount]],
        ];
    }

    public function test_split_lines_persist_with_computed_discount(): void
    {
        // Caso del cliente: 3 uds de $100 — 1 buena (línea A) + 2 dañadas con
        // −$20 c/u (línea B) → total $260. El MISMO producto va en 2 líneas.
        $product = $this->makeProduct(100);

        $resp = $this->actingAs($this->user)->postJson('/api/v1/sales', $this->checkoutPayload([
            ['product_id' => $product->id, 'quantity' => 1, 'price' => 100.0],
            ['product_id' => $product->id, 'quantity' => 2, 'price' => 100.0,
             'line_discount' => ['kind' => 'fixed', 'basis' => 'unit', 'value' => 20, 'reason' => 'danado', 'note' => 'caja golpeada']],
        ], 260.0));

        $resp->assertStatus(201)
            ->assertJsonPath('data.subtotal', 300)
            ->assertJsonPath('data.discount', 40)
            ->assertJsonPath('data.total', 260);

        $sale  = Sale::latest('id')->first();
        $items = SaleItem::where('sale_id', $sale->id)->orderBy('id')->get();

        $this->assertCount(2, $items);

        // Línea A: precio completo, sin beneficio.
        $this->assertNull($items[0]->benefit_type);
        $this->assertSame(0.0, (float) $items[0]->discount_amount);
        $this->assertSame(100.0, (float) $items[0]->total);

        // Línea B: descuento manual computado server-side ($20 × 2 = $40),
        // total BRUTO intacto (200) y metadata completa para auditoría.
        $this->assertSame(SaleItem::BENEFIT_DISCOUNT, $items[1]->benefit_type);
        $this->assertSame('fixed', $items[1]->discount_kind);
        $this->assertSame('unit', $items[1]->discount_basis);
        $this->assertSame(20.0, (float) $items[1]->discount_value);
        $this->assertSame(40.0, (float) $items[1]->discount_amount);
        $this->assertSame('danado', $items[1]->discount_reason);
        $this->assertSame('caja golpeada', $items[1]->discount_note);
        $this->assertSame($this->user->id, (int) $items[1]->discount_authorized_by);
        $this->assertSame(200.0, (float) $items[1]->total);

        // Invariante de reportes: total = subtotal − discount.
        $this->assertSame(260.0, (float) $sale->subtotal - (float) $sale->discount);

        // Stock: se descontaron las 3 unidades (2 líneas del mismo producto).
        $this->assertSame(97.0, (float) Inventory::where('product_id', $product->id)->sum('quantity'));
    }

    public function test_percent_discount_per_line(): void
    {
        // 10% por línea sobre 2 × $150 = $300 → −$30, total $270.
        $product = $this->makeProduct(150);

        $this->actingAs($this->user)->postJson('/api/v1/sales', $this->checkoutPayload([
            ['product_id' => $product->id, 'quantity' => 2, 'price' => 150.0,
             'line_discount' => ['kind' => 'percent', 'basis' => 'line', 'value' => 10, 'reason' => 'cortesia']],
        ], 270.0))
            ->assertStatus(201)
            ->assertJsonPath('data.discount', 30)
            ->assertJsonPath('data.total', 270);
    }

    public function test_server_recomputes_and_rejects_mismatched_payment(): void
    {
        // El cliente "cree" que el descuento es $50 y paga $250, pero el server
        // recomputa $20×2=$40 → total $260. Pago no cuadra → 422, sin venta.
        $product = $this->makeProduct(100);

        $this->actingAs($this->user)->postJson('/api/v1/sales', $this->checkoutPayload([
            ['product_id' => $product->id, 'quantity' => 3, 'price' => 100.0,
             'line_discount' => ['kind' => 'fixed', 'basis' => 'unit', 'value' => 20, 'reason' => 'danado']],
        ], 250.0))
            ->assertStatus(422);

        $this->assertSame(0, Sale::count());
    }

    public function test_v2_rejects_legacy_global_discount(): void
    {
        // calc_version 2 + discount global > 0 → 422 de validación. El descuento
        // global está muerto en v2; todo beneficio va por línea.
        $product = $this->makeProduct(100);

        $payload = $this->checkoutPayload([
            ['product_id' => $product->id, 'quantity' => 1, 'price' => 100.0],
        ], 90.0);
        $payload['discount'] = 10;

        $this->actingAs($this->user)->postJson('/api/v1/sales', $payload)
            ->assertStatus(422)
            ->assertJsonValidationErrors(['discount']);
    }

    public function test_percent_over_100_rejected(): void
    {
        $product = $this->makeProduct(100);

        $this->actingAs($this->user)->postJson('/api/v1/sales', $this->checkoutPayload([
            ['product_id' => $product->id, 'quantity' => 1, 'price' => 100.0,
             'line_discount' => ['kind' => 'percent', 'basis' => 'line', 'value' => 150, 'reason' => 'otro']],
        ], 0.01))
            ->assertStatus(422);
    }

    public function test_discount_never_exceeds_line_base(): void
    {
        // $150/ud sobre uds de $100 → clamp al bruto de la línea ($200), total $0…
        // pero payments.min es 0.01, así que cobramos $0.01 NO: el clamp deja
        // total en 0 y el pago debe cuadrar. Validamos vía monto exacto.
        $product = $this->makeProduct(100);

        // total esperado = 0 → un pago de 0.01 NO cuadra (>1¢ de diferencia con 0
        // no: |0.01-0|=0.01 ≤ tolerancia 0.01 → pasa). Usamos 0.01 y verificamos
        // que la venta persiste con total 0 y discount clampeado a 200.
        $this->actingAs($this->user)->postJson('/api/v1/sales', $this->checkoutPayload([
            ['product_id' => $product->id, 'quantity' => 2, 'price' => 100.0,
             'line_discount' => ['kind' => 'fixed', 'basis' => 'unit', 'value' => 150, 'reason' => 'otro']],
        ], 0.01))
            ->assertStatus(201)
            ->assertJsonPath('data.discount', 200)
            ->assertJsonPath('data.total', 0);
    }

    public function test_legacy_payload_without_calc_version_still_works(): void
    {
        // Ventana de compat (Fase 1→5): SPAs con bundle viejo (PWA cache) siguen
        // mandando el descuento global sin calc_version. Debe funcionar igual.
        $product = $this->makeProduct(280);

        $this->actingAs($this->user)->postJson('/api/v1/sales', [
            'store_id'            => $this->store->id,
            'register_session_id' => $this->session->id,
            'items'               => [['product_id' => $product->id, 'quantity' => 2, 'price' => 280.0]],
            'payments'            => [['payment_method_id' => $this->cashMethod->id, 'amount' => 510.0]],
            'discount'            => 50,
        ])
            ->assertStatus(201)
            ->assertJsonPath('data.discount', 50)
            ->assertJsonPath('data.total', 510);
    }

    public function test_sale_items_resource_exposes_benefit_fields(): void
    {
        $product = $this->makeProduct(100);

        $this->actingAs($this->user)->postJson('/api/v1/sales', $this->checkoutPayload([
            ['product_id' => $product->id, 'quantity' => 2, 'price' => 100.0,
             'line_discount' => ['kind' => 'fixed', 'basis' => 'unit', 'value' => 20, 'reason' => 'danado']],
        ], 160.0))->assertStatus(201);

        $sale = Sale::latest('id')->first();

        $this->actingAs($this->user)
            ->getJson("/api/v1/sales/{$sale->id}")
            ->assertStatus(200)
            ->assertJsonPath('data.items.0.benefit_type', 'discount')
            ->assertJsonPath('data.items.0.discount_amount', 40)
            ->assertJsonPath('data.items.0.discount_reason', 'danado');
    }
}
