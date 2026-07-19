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
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Promociones NxM en el checkout v2 (Fase 3): el SERVER evalúa las promos
 * vigentes y aplica la mejor por línea — el cliente nunca decide el monto.
 * No-stacking: descuento manual excluye la promo. Snapshot en sale_items
 * (promo_name/promo_free_qty, espíritu ADR-015).
 */
class PromotionCheckoutTest extends TestCase
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
        \App\Models\Warehouse::create([
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
        $warehouse = \App\Models\Warehouse::where('store_id', $this->store->id)->first();
        $product = Product::create([
            'company_id' => $this->store->company_id,
            'name' => 'Producto ' . uniqid(), 'sku' => 'SKU-' . uniqid(),
            'cost' => 10, 'active' => true,
        ]);
        $product->price()->create(['price_1' => $price]);
        Inventory::create(['product_id' => $product->id, 'warehouse_id' => $warehouse->id, 'quantity' => 100]);
        return $product;
    }

    private function checkout(array $items, float $paymentAmount)
    {
        return $this->actingAs($this->user)->postJson('/api/v1/sales', [
            'store_id'            => $this->store->id,
            'register_session_id' => $this->session->id,
            'calc_version'        => 2,
            'items'               => $items,
            'payments'            => [['payment_method_id' => $this->cashMethod->id, 'amount' => $paymentAmount]],
        ]);
    }

    public function test_2x1_applies_server_side_with_snapshot(): void
    {
        $product = $this->makeProduct(50);
        ProductPromotion::create([
            'product_id' => $product->id, 'name' => '2x1 Verano', 'buy_n' => 2, 'pay_m' => 1,
        ]);

        // 3 uds @ $50 con 2x1 → 1 gratis ($50) + 1 resto → total $100.
        $this->checkout([
            ['product_id' => $product->id, 'quantity' => 3, 'price' => 50.0],
        ], 100.0)
            ->assertStatus(201)
            ->assertJsonPath('data.subtotal', 150)
            ->assertJsonPath('data.discount', 50)
            ->assertJsonPath('data.total', 100);

        $item = SaleItem::first();
        $this->assertSame('promo', $item->benefit_type);
        $this->assertSame(50.0, (float) $item->discount_amount);
        $this->assertSame('2x1 Verano', $item->promo_name);
        $this->assertSame(1, (int) $item->promo_free_qty);
        $this->assertNotNull($item->applied_promotion_id);
    }

    public function test_best_promo_wins_when_multiple_valid(): void
    {
        $product = $this->makeProduct(50);
        ProductPromotion::create(['product_id' => $product->id, 'name' => '3x2', 'buy_n' => 3, 'pay_m' => 2, 'priority' => 9]);
        ProductPromotion::create(['product_id' => $product->id, 'name' => '2x1', 'buy_n' => 2, 'pay_m' => 1, 'priority' => 0]);

        // 6 uds: 3x2 → 2 gratis ($100) · 2x1 → 3 gratis ($150). Gana 2x1 pese
        // a menor priority (mayor ahorro manda; priority solo desempata).
        $this->checkout([
            ['product_id' => $product->id, 'quantity' => 6, 'price' => 50.0],
        ], 150.0)
            ->assertStatus(201)
            ->assertJsonPath('data.discount', 150)
            ->assertJsonPath('data.total', 150);

        $this->assertSame('2x1', SaleItem::first()->promo_name);
    }

    public function test_manual_discount_stacks_on_promo_result(): void
    {
        // STACKING (regla Joel 2026-07-17, antes no-stacking): promo primero,
        // manual sobre el neto-promo. 2 uds @ $50 con 2x1 → neto $50; 10%
        // manual sobre $50 = $5 → total $45; discount rollup = 50 + 5 = 55.
        $product = $this->makeProduct(50);
        $promo = ProductPromotion::create(['product_id' => $product->id, 'name' => '2x1', 'buy_n' => 2, 'pay_m' => 1]);

        $this->checkout([
            ['product_id' => $product->id, 'quantity' => 2, 'price' => 50.0,
             'line_discount' => ['kind' => 'percent', 'basis' => 'line', 'value' => 10, 'reason' => 'danado']],
        ], 45.0)
            ->assertStatus(201)
            ->assertJsonPath('data.discount', 55)
            ->assertJsonPath('data.total', 45);

        $item = SaleItem::first();
        // Con manual presente el type queda 'discount', pero el snapshot de la
        // promo se conserva (historial muestra ambos beneficios).
        $this->assertSame('discount', $item->benefit_type);
        $this->assertSame($promo->id, (int) $item->applied_promotion_id);
        $this->assertSame('2x1', $item->promo_name);
        $this->assertSame(1, (int) $item->promo_free_qty);
        $this->assertSame(55.0, (float) $item->discount_amount);
    }

    public function test_stacking_fixed_discount_case_joel(): void
    {
        // Caso QA Joel 2026-07-17: 2×$2,900 con 2x1 y −$100 fijo → $2,800
        // (antes daba $5,700 porque el manual reemplazaba la promo).
        $product = $this->makeProduct(2900);
        ProductPromotion::create(['product_id' => $product->id, 'name' => '2x1', 'buy_n' => 2, 'pay_m' => 1]);

        $this->checkout([
            ['product_id' => $product->id, 'quantity' => 2, 'price' => 2900.0,
             'line_discount' => ['kind' => 'fixed', 'basis' => 'line', 'value' => 100, 'reason' => 'otro']],
        ], 2800.0)
            ->assertStatus(201)
            ->assertJsonPath('data.discount', 3000)
            ->assertJsonPath('data.total', 2800);
    }

    public function test_paused_and_expired_promos_do_not_apply(): void
    {
        $product = $this->makeProduct(50);
        ProductPromotion::create([
            'product_id' => $product->id, 'name' => 'Pausada', 'buy_n' => 2, 'pay_m' => 1,
            'status' => ProductPromotion::STATUS_PAUSED,
        ]);
        ProductPromotion::create([
            'product_id' => $product->id, 'name' => 'Vencida', 'buy_n' => 2, 'pay_m' => 1,
            'ends_at' => now()->subDay(),
        ]);
        ProductPromotion::create([
            'product_id' => $product->id, 'name' => 'Futura', 'buy_n' => 2, 'pay_m' => 1,
            'starts_at' => now()->addDay(),
        ]);

        // Ninguna vigente → precio completo.
        $this->checkout([
            ['product_id' => $product->id, 'quantity' => 2, 'price' => 50.0],
        ], 100.0)
            ->assertStatus(201)
            ->assertJsonPath('data.discount', 0)
            ->assertJsonPath('data.total', 100);
    }

    public function test_qty_below_n_pays_full_price(): void
    {
        $product = $this->makeProduct(50);
        ProductPromotion::create(['product_id' => $product->id, 'name' => '3x2', 'buy_n' => 3, 'pay_m' => 2]);

        $this->checkout([
            ['product_id' => $product->id, 'quantity' => 2, 'price' => 50.0],
        ], 100.0)
            ->assertStatus(201)
            ->assertJsonPath('data.discount', 0)
            ->assertJsonPath('data.total', 100);
    }

    public function test_promo_payment_mismatch_rejected(): void
    {
        // El cliente ignora la promo y paga completo → el server recomputa
        // $100 y el pago de $150 no cuadra → 422 (nunca se cobra de más).
        $product = $this->makeProduct(50);
        ProductPromotion::create(['product_id' => $product->id, 'name' => '2x1', 'buy_n' => 2, 'pay_m' => 1]);

        $this->checkout([
            ['product_id' => $product->id, 'quantity' => 3, 'price' => 50.0],
        ], 150.0)->assertStatus(422);

        $this->assertSame(0, Sale::count());
    }

    // ── Tipo qty_discount = MAYOREO: "desde N pzas, −$X c/u" (2026-07-23) ────

    private function makeQtyPromo(Product $product, int $minQty, float $perUnit): ProductPromotion
    {
        return ProductPromotion::create([
            'product_id' => $product->id, 'name' => 'Mayoreo',
            'type' => ProductPromotion::TYPE_QTY_DISCOUNT,
            'min_qty' => $minQty, 'discount_per_unit' => $perUnit,
        ]);
    }

    public function test_mayoreo_descuenta_cada_pieza_con_snapshot(): void
    {
        // Caso Joel: 5 pzas @ $200 desde 5 con −$100 c/u → −$500. Total 500.
        $product = $this->makeProduct(200);
        $promo = $this->makeQtyPromo($product, 5, 100.0);

        $this->checkout([
            ['product_id' => $product->id, 'quantity' => 5, 'price' => 200.0],
        ], 500.0)
            ->assertStatus(201)
            ->assertJsonPath('data.discount', 500)
            ->assertJsonPath('data.total', 500);

        $item = SaleItem::firstOrFail();
        $this->assertSame('promo', $item->benefit_type);
        $this->assertSame($promo->id, (int) $item->applied_promotion_id);
        $this->assertSame('Mayoreo', $item->promo_name);
        $this->assertSame(0, (int) $item->promo_free_qty);
        $this->assertEqualsWithDelta(500.0, (float) $item->promo_amount, 0.001);
    }

    public function test_mayoreo_cuenta_las_piezas_intermedias(): void
    {
        // 7 pzas con (min 5, −$100 c/u) = −$700. Es LO QUE LO SEPARA del modelo
        // por grupos que había antes, que solo habría descontado $500.
        $product = $this->makeProduct(200);
        $this->makeQtyPromo($product, 5, 100.0);

        $this->checkout([
            ['product_id' => $product->id, 'quantity' => 7, 'price' => 200.0],
        ], 700.0)
            ->assertStatus(201)
            ->assertJsonPath('data.discount', 700)
            ->assertJsonPath('data.total', 700);
    }

    public function test_mayoreo_no_alcanza_el_minimo(): void
    {
        $product = $this->makeProduct(200);
        $this->makeQtyPromo($product, 5, 100.0);

        // 4 pzas: una abajo del umbral → sin descuento.
        $this->checkout([
            ['product_id' => $product->id, 'quantity' => 4, 'price' => 200.0],
        ], 800.0)
            ->assertStatus(201)
            ->assertJsonPath('data.discount', 0)
            ->assertJsonPath('data.total', 800);
    }

    public function test_mayoreo_sin_configurar_no_aplica(): void
    {
        // Las promos que la migración de escalones dejó pausadas quedan con
        // min_qty NULL: existen, pero nunca deben descontar.
        $product = $this->makeProduct(200);
        ProductPromotion::create([
            'product_id' => $product->id, 'name' => 'Sin configurar',
            'type' => ProductPromotion::TYPE_QTY_DISCOUNT,
        ]);

        $this->checkout([
            ['product_id' => $product->id, 'quantity' => 10, 'price' => 200.0],
        ], 2000.0)
            ->assertStatus(201)
            ->assertJsonPath('data.discount', 0)
            ->assertJsonPath('data.total', 2000);
    }

    public function test_qty_discount_clampeado_al_bruto_de_la_linea(): void
    {
        // Descuento absurdo (−$500 c/u con precio $100): no puede superar el
        // bruto ($200) de SU línea — nunca vuelve negativa la venta. Segunda
        // línea normal para que el total no sea $0 (pago mínimo).
        $clamped = $this->makeProduct(100);
        $this->makeQtyPromo($clamped, 2, 500.0);
        $normal = $this->makeProduct(80);

        $this->checkout([
            ['product_id' => $clamped->id, 'quantity' => 2, 'price' => 100.0],
            ['product_id' => $normal->id, 'quantity' => 1, 'price' => 80.0],
        ], 80.0)
            ->assertStatus(201)
            ->assertJsonPath('data.discount', 200)
            ->assertJsonPath('data.total', 80);
    }

    public function test_manual_stackea_sobre_qty_discount(): void
    {
        // 2 pzas @ $200 con mayoreo (min 2, −$50 c/u) = −$100 → neto promo
        // $300; manual $50 fixed line sobre ese neto → total $250;
        // discount_amount = 150.
        $product = $this->makeProduct(200);
        $this->makeQtyPromo($product, 2, 50.0);

        $this->actingAs($this->user)->postJson('/api/v1/sales', [
            'store_id'            => $this->store->id,
            'register_session_id' => $this->session->id,
            'calc_version'        => 2,
            'items'               => [[
                'product_id' => $product->id, 'quantity' => 2, 'price' => 200.0,
                'line_discount' => ['kind' => 'fixed', 'basis' => 'line', 'value' => 50, 'reason' => 'otro'],
            ]],
            'payments'            => [['payment_method_id' => $this->cashMethod->id, 'amount' => 250.0]],
        ])
            ->assertStatus(201)
            ->assertJsonPath('data.total', 250);

        $item = SaleItem::firstOrFail();
        $this->assertSame('discount', $item->benefit_type);
        $this->assertEqualsWithDelta(150.0, (float) $item->discount_amount, 0.001);
        $this->assertEqualsWithDelta(100.0, (float) $item->promo_amount, 0.001);
    }

    public function test_nxm_sigue_llenando_promo_amount(): void
    {
        $product = $this->makeProduct(50);
        ProductPromotion::create(['product_id' => $product->id, 'name' => '2x1', 'buy_n' => 2, 'pay_m' => 1]);

        $this->checkout([
            ['product_id' => $product->id, 'quantity' => 2, 'price' => 50.0],
        ], 50.0)->assertStatus(201);

        $item = SaleItem::firstOrFail();
        $this->assertSame(1, (int) $item->promo_free_qty);
        $this->assertEqualsWithDelta(50.0, (float) $item->promo_amount, 0.001);
    }
}
