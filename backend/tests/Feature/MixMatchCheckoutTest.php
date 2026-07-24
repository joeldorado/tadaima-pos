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
use App\Models\SaleItem;
use App\Models\Store;
use App\Models\User;
use App\Services\SaleCalculator;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Motor MIX & MATCH (Joel 2026-07-23): las líneas de productos asignados a la
 * misma promo forman un pool. Los escenarios S1..S12 son la TABLA DE PARIDAD
 * con el gemelo TS — los MISMOS números viven en saleCalc.test.ts ("paridad
 * mix & match"); si tocas un caso aquí, tócalo allá. I1..I3 son integración
 * por API (snapshot por línea, skip, guard de pago).
 */
class MixMatchCheckoutTest extends TestCase
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

    // ── Helpers de la parte UNITARIA (calculate() directo, sin HTTP) ─────────

    /** Instancia en memoria = una fila del join expandido (promo × producto). */
    private function promoRow(int $id, int $productId, array $attrs): ProductPromotion
    {
        $p = new ProductPromotion($attrs);
        $p->id = $id;
        $p->product_id = $productId;

        return $p;
    }

    private function line(int $productId, float $price, float $qty, array $extra = []): array
    {
        return array_merge([
            'product_id' => $productId,
            'unit_price' => $price,
            'qty'        => $qty,
        ], $extra);
    }

    private function calc(array $lines, array $promos): array
    {
        return (new SaleCalculator())->calculate($lines, $promos);
    }

    // ── S1..S12 — tabla de paridad (espejo exacto en saleCalc.test.ts) ───────

    public function test_s1_2x1_cruzado_una_pieza_de_a_y_una_de_b(): void
    {
        $promos = [
            $this->promoRow(10, 1, ['name' => '2x1 Cruzado', 'buy_n' => 2, 'pay_m' => 1]),
            $this->promoRow(10, 2, ['name' => '2x1 Cruzado', 'buy_n' => 2, 'pay_m' => 1]),
        ];
        $r = $this->calc([$this->line(1, 200, 1), $this->line(2, 150, 1)], $promos);

        // La gratis cae en la MÁS BARATA (B, $150); A contribuye sin beneficio.
        $this->assertNull($r['lines'][0]['applied_promotion_id']);
        $this->assertSame(0.0, (float) $r['lines'][0]['discount_amount']);
        $this->assertSame(10, $r['lines'][1]['applied_promotion_id']);
        $this->assertSame(150.0, (float) $r['lines'][1]['discount_amount']);
        $this->assertSame(1, $r['lines'][1]['promo_free_qty']);
        $this->assertSame(200.0, (float) $r['total']);
    }

    public function test_s2_3x2_con_tres_productos_gratis_la_mas_barata(): void
    {
        $promos = [];
        foreach ([1, 2, 3] as $pid) {
            $promos[] = $this->promoRow(11, $pid, ['name' => '3x2 Trío', 'buy_n' => 3, 'pay_m' => 2]);
        }
        $r = $this->calc([
            $this->line(1, 100, 1),
            $this->line(2, 80, 1),
            $this->line(3, 120, 1),
        ], $promos);

        $this->assertSame(80.0, (float) $r['lines'][1]['discount_amount']);
        $this->assertSame(0.0, (float) $r['lines'][0]['discount_amount']);
        $this->assertSame(0.0, (float) $r['lines'][2]['discount_amount']);
        $this->assertSame(220.0, (float) $r['total']);
    }

    public function test_s3_empates_deterministas_precio_producto_e_indice(): void
    {
        // Mismo precio: desempata product_id asc → gana el producto 3.
        $promos = [
            $this->promoRow(12, 5, ['name' => '2x1 Empate', 'buy_n' => 2, 'pay_m' => 1]),
            $this->promoRow(12, 3, ['name' => '2x1 Empate', 'buy_n' => 2, 'pay_m' => 1]),
        ];
        $r = $this->calc([$this->line(5, 100, 1), $this->line(3, 100, 1)], $promos);
        $this->assertSame(0.0, (float) $r['lines'][0]['discount_amount']);
        $this->assertSame(100.0, (float) $r['lines'][1]['discount_amount']);

        // Mismo precio Y producto (splits): desempata el índice posicional.
        $promos2 = [$this->promoRow(13, 7, ['name' => '2x1 Split', 'buy_n' => 2, 'pay_m' => 1])];
        $r2 = $this->calc([$this->line(7, 100, 1), $this->line(7, 100, 1)], $promos2);
        $this->assertSame(100.0, (float) $r2['lines'][0]['discount_amount']);
        $this->assertSame(0.0, (float) $r2['lines'][1]['discount_amount']);
    }

    public function test_s4_mayoreo_combinado_alcanza_el_minimo_entre_productos(): void
    {
        $promos = [
            $this->promoRow(14, 1, ['name' => 'Mayoreo Combo', 'type' => 'qty_discount', 'min_qty' => 5, 'discount_per_unit' => 20]),
            $this->promoRow(14, 2, ['name' => 'Mayoreo Combo', 'type' => 'qty_discount', 'min_qty' => 5, 'discount_per_unit' => 20]),
        ];
        // 3 + 2 = 5 piezas combinadas ≥ 5 → CADA pieza del pool con −$20.
        $r = $this->calc([$this->line(1, 100, 3), $this->line(2, 90, 2)], $promos);

        $this->assertSame(60.0, (float) $r['lines'][0]['discount_amount']);
        $this->assertSame(40.0, (float) $r['lines'][1]['discount_amount']);
        $this->assertSame(380.0, (float) $r['total']);
    }

    public function test_s5_mayoreo_combinado_no_alcanza_el_minimo(): void
    {
        $promos = [
            $this->promoRow(15, 1, ['name' => 'Mayoreo Lejos', 'type' => 'qty_discount', 'min_qty' => 5, 'discount_per_unit' => 20]),
            $this->promoRow(15, 2, ['name' => 'Mayoreo Lejos', 'type' => 'qty_discount', 'min_qty' => 5, 'discount_per_unit' => 20]),
        ];
        $r = $this->calc([$this->line(1, 100, 2), $this->line(2, 90, 2)], $promos);

        $this->assertSame(0.0, (float) $r['line_benefit_total']);
        $this->assertSame(380.0, (float) $r['total']);
    }

    public function test_s6_mayoreo_clamp_por_linea_al_bruto(): void
    {
        $promos = [
            $this->promoRow(16, 1, ['name' => 'Mayoreo Fuerte', 'type' => 'qty_discount', 'min_qty' => 2, 'discount_per_unit' => 100]),
            $this->promoRow(16, 2, ['name' => 'Mayoreo Fuerte', 'type' => 'qty_discount', 'min_qty' => 2, 'discount_per_unit' => 100]),
        ];
        // A: 2×$30 = $60 bruto, el descuento teórico $200 se clampa a $60.
        $r = $this->calc([$this->line(1, 30, 2), $this->line(2, 500, 1)], $promos);

        $this->assertSame(60.0, (float) $r['lines'][0]['discount_amount']);
        $this->assertSame(100.0, (float) $r['lines'][1]['discount_amount']);
        $this->assertSame(400.0, (float) $r['total']);
    }

    public function test_s7_greedy_linea_consumida_no_entra_al_segundo_pool(): void
    {
        // El producto 1 está en DOS promos; gana la de mayor ahorro y la línea
        // queda consumida — la otra ya no la toca.
        $promos = [
            $this->promoRow(20, 1, ['name' => '2x1 Gana', 'buy_n' => 2, 'pay_m' => 1]),
            $this->promoRow(21, 1, ['name' => 'Mayoreo Pierde', 'type' => 'qty_discount', 'min_qty' => 2, 'discount_per_unit' => 10]),
        ];
        $r = $this->calc([$this->line(1, 100, 2)], $promos);

        $this->assertSame(20, $r['lines'][0]['applied_promotion_id']);
        $this->assertSame(100.0, (float) $r['lines'][0]['discount_amount']);
    }

    public function test_s8_override_local_separa_pools(): void
    {
        // Global 2x1 en A y B; local (mayoreo min 2) SOLO en A → A sale del
        // pool global (el override es POR PRODUCTO). Ninguna dispara:
        // la local con 1 pieza no alcanza, y B solo ya no arma el 2x1.
        $promos = [
            $this->promoRow(30, 1, ['name' => 'Global 2x1', 'buy_n' => 2, 'pay_m' => 1]),
            $this->promoRow(30, 2, ['name' => 'Global 2x1', 'buy_n' => 2, 'pay_m' => 1]),
            $this->promoRow(31, 1, ['name' => 'Local A', 'type' => 'qty_discount', 'min_qty' => 2, 'discount_per_unit' => 5, 'store_id' => 1]),
        ];
        $r = $this->calc([$this->line(1, 100, 1), $this->line(2, 100, 1)], $promos);

        $this->assertSame(0.0, (float) $r['line_benefit_total']);
    }

    public function test_s9_lineas_split_del_mismo_producto_se_combinan(): void
    {
        // Cambio de spec §8 (consecuencia de mix & match): si A+B combinan,
        // A+A también. Antes cada línea split se evaluaba sola.
        $promos = [$this->promoRow(40, 1, ['name' => '2x1 Split', 'buy_n' => 2, 'pay_m' => 1])];
        $r = $this->calc([$this->line(1, 100, 1), $this->line(1, 100, 1)], $promos);

        $this->assertSame(100.0, (float) $r['line_benefit_total']);
        $this->assertSame(100.0, (float) $r['total']);
    }

    public function test_s10_pool_de_una_linea_degenera_exacto(): void
    {
        // 5 pzas con 2x1 = 2 grupos → 2 gratis. Idéntico al motor anterior.
        $promos = [$this->promoRow(50, 1, ['name' => '2x1 Solo', 'buy_n' => 2, 'pay_m' => 1])];
        $r = $this->calc([$this->line(1, 100, 5)], $promos);

        $this->assertSame(200.0, (float) $r['lines'][0]['discount_amount']);
        $this->assertSame(2, $r['lines'][0]['promo_free_qty']);
        $this->assertSame(300.0, (float) $r['total']);
    }

    public function test_s11_qty_fraccionaria_no_aporta_unidades_al_pool(): void
    {
        $promos = [
            $this->promoRow(60, 1, ['name' => '2x1 Frac', 'buy_n' => 2, 'pay_m' => 1]),
            $this->promoRow(60, 2, ['name' => '2x1 Frac', 'buy_n' => 2, 'pay_m' => 1]),
        ];
        // 0.5 de A no poolea → U = 1 → el 2x1 no dispara.
        $r = $this->calc([$this->line(1, 100, 0.5), $this->line(2, 100, 1)], $promos);

        $this->assertSame(0.0, (float) $r['line_benefit_total']);
    }

    public function test_s12_stacking_manual_sobre_pool_y_rollup_cuadran(): void
    {
        $promos = [
            $this->promoRow(70, 1, ['name' => '2x1 Stack', 'buy_n' => 2, 'pay_m' => 1]),
            $this->promoRow(70, 2, ['name' => '2x1 Stack', 'buy_n' => 2, 'pay_m' => 1]),
        ];
        // La gratis cae en B ($150). El manual 10% va en A (contribuyente):
        // base de A = bruto (sin promo) → manual $20.
        $r = $this->calc([
            $this->line(1, 200, 1, ['line_discount' => ['kind' => 'percent', 'basis' => 'line', 'value' => 10]]),
            $this->line(2, 150, 1),
        ], $promos);

        $this->assertSame(20.0, (float) $r['lines'][0]['discount_amount']);
        $this->assertSame('discount', $r['lines'][0]['benefit_type']);
        $this->assertSame(150.0, (float) $r['lines'][1]['discount_amount']);
        $this->assertSame('promo', $r['lines'][1]['benefit_type']);
        // Rollup: sales.discount = Σ discount_amount y el total cuadra.
        $this->assertSame(170.0, (float) $r['line_benefit_total']);
        $this->assertSame(180.0, (float) $r['total']);
    }

    // ── I1..I3 — integración por API (checkout real) ─────────────────────────

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

    public function test_i1_checkout_cruzado_con_snapshot_por_linea(): void
    {
        $a = $this->makeProduct(200);
        $b = $this->makeProduct(150);
        $promo = ProductPromotion::create(['name' => '2x1 Cruzado Real', 'buy_n' => 2, 'pay_m' => 1]);
        $promo->products()->syncWithoutDetaching([$a->id, $b->id]);

        $this->checkout([
            ['product_id' => $a->id, 'quantity' => 1, 'price' => 200.0],
            ['product_id' => $b->id, 'quantity' => 1, 'price' => 150.0],
        ], 200.0)
            ->assertStatus(201)
            ->assertJsonPath('data.subtotal', 350)
            ->assertJsonPath('data.discount', 150)
            ->assertJsonPath('data.total', 200);

        $itemA = SaleItem::where('product_id', $a->id)->first();
        $itemB = SaleItem::where('product_id', $b->id)->first();
        // Contribuyente: sin snapshot (como una promo que no disparó).
        $this->assertNull($itemA->applied_promotion_id);
        $this->assertSame(0.0, (float) $itemA->discount_amount);
        // Beneficiada: snapshot completo con el id de la promo GENERAL.
        $this->assertSame($promo->id, (int) $itemB->applied_promotion_id);
        $this->assertSame('2x1 Cruzado Real', $itemB->promo_name);
        $this->assertSame(1, (int) $itemB->promo_free_qty);
        $this->assertSame(150.0, (float) $itemB->promo_amount);
    }

    public function test_i2_skip_promotion_saca_la_linea_del_pool(): void
    {
        $a = $this->makeProduct(200);
        $b = $this->makeProduct(150);
        $promo = ProductPromotion::create(['name' => '2x1 Skip', 'buy_n' => 2, 'pay_m' => 1]);
        $promo->products()->syncWithoutDetaching([$a->id, $b->id]);

        // B renuncia a la promo → el pool queda solo con A (1 pieza) → no
        // dispara → se cobra completo.
        $this->checkout([
            ['product_id' => $a->id, 'quantity' => 1, 'price' => 200.0],
            ['product_id' => $b->id, 'quantity' => 1, 'price' => 150.0, 'skip_promotion' => true],
        ], 350.0)
            ->assertStatus(201)
            ->assertJsonPath('data.discount', 0)
            ->assertJsonPath('data.total', 350);
    }

    public function test_i3_promo_solo_tarjeta_bloquea_aunque_el_beneficio_caiga_en_otra_linea(): void
    {
        $a = $this->makeProduct(200);
        $b = $this->makeProduct(150);
        $promo = ProductPromotion::create([
            'name' => '2x1 Solo Tarjeta', 'buy_n' => 2, 'pay_m' => 1, 'allow_cash' => false,
        ]);
        $promo->products()->syncWithoutDetaching([$a->id, $b->id]);

        // La promo aplicó (beneficio en B) y NO permite efectivo → bloquea el
        // cobro completo, aunque A (la línea cara) no traiga el snapshot.
        $this->checkout([
            ['product_id' => $a->id, 'quantity' => 1, 'price' => 200.0],
            ['product_id' => $b->id, 'quantity' => 1, 'price' => 150.0],
        ], 200.0)
            ->assertStatus(422);
    }
}
