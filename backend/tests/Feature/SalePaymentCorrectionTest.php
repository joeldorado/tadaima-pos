<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\CashRegister;
use App\Models\CashRegisterSession;
use App\Models\Company;
use App\Models\Inventory;
use App\Models\Payment;
use App\Models\PaymentMethod;
use App\Models\Product;
use App\Models\ProductPromotion;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\Store;
use App\Models\SystemLog;
use App\Models\Terminal;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * Corregir el método de pago de una venta (2026-09-30): cualquier rol de la
 * tienda mientras la caja donde se cobró siga abierta; con el corte cerrado,
 * solo admin. Mismo total, comisión recalculada, esperado del corte al día.
 */
class SalePaymentCorrectionTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;
    private Store $storeA;
    private Store $storeB;
    private Warehouse $warehouse;
    private User $cajero1;
    private User $cajero2;
    private User $gerente;
    private User $admin;
    private User $cajeroB;
    private CashRegisterSession $session;
    private PaymentMethod $cash;
    private PaymentMethod $card;
    private PaymentMethod $transfer;
    private Terminal $terminal;

    protected function setUp(): void
    {
        parent::setUp();

        $this->company = Company::create(['name' => 'Tadaima Test']);
        $this->storeA  = Store::create(['company_id' => $this->company->id, 'name' => 'Tienda A', 'active' => true]);
        $this->storeB  = Store::create(['company_id' => $this->company->id, 'name' => 'Tienda B', 'active' => true]);
        $this->warehouse = Warehouse::create([
            'company_id' => $this->company->id, 'store_id' => $this->storeA->id,
            'name' => 'Exhibición', 'type' => 'store', 'active' => true,
        ]);

        $this->cajero1 = $this->makeUser('cajero1@test.com', 'cajero', $this->storeA->id);
        $this->cajero2 = $this->makeUser('cajero2@test.com', 'cajero', $this->storeA->id);
        $this->gerente = $this->makeUser('gerente@test.com', 'gerente', $this->storeA->id);
        $this->admin   = $this->makeUser('admin@test.com', 'admin', null);
        $this->cajeroB = $this->makeUser('cajerob@test.com', 'cajero', $this->storeB->id);

        $register = CashRegister::create(['store_id' => $this->storeA->id, 'name' => 'Caja 1', 'active' => true]);
        $this->session = CashRegisterSession::create([
            'register_id' => $register->id, 'user_id' => $this->cajero1->id,
            'opening_cash' => 0, 'status' => 'open', 'opened_at' => now(),
        ]);

        $this->cash     = PaymentMethod::create(['name' => 'Efectivo', 'active' => true]);
        $this->card     = PaymentMethod::create(['name' => 'Tarjeta Débito', 'active' => true]);
        $this->transfer = PaymentMethod::create(['name' => 'Transferencia', 'active' => true]);
        $this->terminal = Terminal::create(['store_id' => $this->storeA->id, 'name' => 'Clip', 'commission_percent' => 3.5, 'active' => true]);
    }

    private function makeUser(string $email, string $role, ?int $storeId): User
    {
        $user = User::create([
            'name' => $email, 'email' => $email, 'password' => bcrypt('password'),
            'company_id' => $this->company->id, 'store_id' => $storeId, 'active' => true,
        ]);
        $roleId = DB::table('roles')->where('name', $role)->value('id')
            ?? DB::table('roles')->insertGetId(['name' => $role, 'guard_name' => 'api', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('model_has_roles')->insert(['role_id' => $roleId, 'model_type' => User::class, 'model_id' => $user->id]);

        return $user;
    }

    private function makeProduct(?array $restriction = null): Product
    {
        $product = Product::create([
            'company_id' => $this->company->id, 'name' => 'Producto ' . uniqid(),
            'sku' => 'SKU-' . uniqid(), 'active' => true,
        ]);
        $product->price()->create(['price_1' => 500.0]);
        if ($restriction !== null) {
            $product->paymentMethod()->create($restriction);
        }
        Inventory::create(['product_id' => $product->id, 'warehouse_id' => $this->warehouse->id, 'quantity' => 10]);

        return $product;
    }

    /** Venta de $500 cobrada por cajero1 en su caja abierta. */
    private function makeSale(array $payments, array $extra = [], ?Product $product = null): Sale
    {
        $product ??= $this->makeProduct();
        $id = $this->actingAs($this->cajero1)->postJson('/api/v1/sales', [
            'store_id'            => $this->storeA->id,
            'register_session_id' => $this->session->id,
            'items'               => [['product_id' => $product->id, 'quantity' => 1, 'price' => 500.0]],
            'payments'            => $payments,
        ] + $extra)->assertCreated()->json('data.id');

        return Sale::findOrFail($id);
    }

    private function cashSale(): Sale
    {
        return $this->makeSale([['payment_method_id' => $this->cash->id, 'amount' => 500.0]], ['cash_received' => 1000, 'change_amount' => 500]);
    }

    private function correct(User $as, Sale $sale, array $payments, ?string $reason = 'se registró mal el pago'): TestResponse
    {
        return $this->actingAs($as)->putJson("/api/v1/sales/{$sale->id}/payments", ['payments' => $payments, 'reason' => $reason]);
    }

    private function toCard(): array
    {
        return [['payment_method_id' => $this->card->id, 'amount' => 500.0, 'terminal_id' => $this->terminal->id]];
    }

    private function cashReportRow(): array
    {
        $range = 'from=' . now()->subDay()->toDateString() . '&to=' . now()->addDay()->toDateString();

        return collect($this->actingAs($this->admin)->getJson("/api/v1/reports/cash?{$range}")->assertOk()->json('data.sessions'))
            ->firstWhere('id', $this->session->id);
    }

    // ── Quién puede ────────────────────────────────────────────────────────────

    public function test_cajero_corrige_efectivo_a_tarjeta_con_caja_abierta(): void
    {
        $sale = $this->cashSale();

        $this->correct($this->cajero1, $sale, $this->toCard(), 'se marcó mal')
            ->assertOk()
            ->assertJsonPath('data.register_session_status', 'open');

        $payment = Payment::where('sale_id', $sale->id)->sole();
        $this->assertSame($this->card->id, (int) $payment->payment_method_id);
        $this->assertSame($this->terminal->id, (int) $payment->terminal_id);
        $this->assertEquals(17.5, $payment->commission_amount);

        $sale->refresh();
        $this->assertEquals(17.5, $sale->commission_amount);
        $this->assertNull($sale->cash_received);
        $this->assertNull($sale->change_amount);

        $log = SystemLog::where('action', 'sale.payment_changed')->sole();
        $this->assertSame($sale->id, (int) $log->entity_id);
        $this->assertSame('se marcó mal', $log->meta['reason']);
        $this->assertTrue($log->meta['session_open']);
        $this->assertSame('Efectivo', $log->meta['before']['payments'][0]['method']);
        $this->assertSame('Tarjeta Débito', $log->meta['after']['payments'][0]['method']);
    }

    public function test_otro_cajero_de_la_tienda_corrige_si_la_caja_sigue_abierta(): void
    {
        $this->correct($this->cajero2, $this->cashSale(), $this->toCard())->assertOk();
    }

    public function test_cajero_y_gerente_no_corrigen_si_la_caja_ya_se_cerro(): void
    {
        $sale = $this->cashSale();
        $this->session->update(['status' => 'closed', 'closed_at' => now()]);

        foreach ([$this->cajero1, $this->gerente] as $user) {
            $this->correct($user, $sale, $this->toCard())
                ->assertStatus(403)
                ->assertJsonPath('errors.code.0', 'SALE_PAYMENT_CORRECTION_FORBIDDEN');
        }
        $this->assertSame($this->cash->id, (int) Payment::where('sale_id', $sale->id)->sole()->payment_method_id);
    }

    public function test_admin_corrige_aunque_el_corte_este_cerrado(): void
    {
        $sale = $this->cashSale();
        $this->session->update(['status' => 'closed', 'closed_at' => now()]);

        $this->correct($this->admin, $sale, $this->toCard())->assertOk();
        $this->assertFalse(SystemLog::where('action', 'sale.payment_changed')->sole()->meta['session_open']);
    }

    public function test_cajero_de_otra_tienda_403(): void
    {
        $this->correct($this->cajeroB, $this->cashSale(), $this->toCard())->assertStatus(403);
    }

    // ── Reglas ─────────────────────────────────────────────────────────────────

    public function test_rechaza_venta_con_cancelacion(): void
    {
        $full = $this->cashSale();
        // Venta de 2 piezas para cancelar 1.
        $sale = Sale::findOrFail($this->actingAs($this->cajero1)->postJson('/api/v1/sales', [
            'store_id' => $this->storeA->id, 'register_session_id' => $this->session->id,
            'items' => [['product_id' => $this->makeProduct()->id, 'quantity' => 2, 'price' => 500.0]],
            'payments' => [['payment_method_id' => $this->cash->id, 'amount' => 1000.0]],
        ])->assertCreated()->json('data.id'));
        $itemId = SaleItem::where('sale_id', $sale->id)->value('id');
        $this->actingAs($this->cajero1)->postJson("/api/v1/sales/{$sale->id}/cancel", [
            'reason_code' => 'otro', 'cash_session_id' => $this->session->id,
            'items' => [['sale_item_id' => $itemId, 'quantity' => 1]],
        ])->assertOk();

        $this->correct($this->cajero1, $sale, [['payment_method_id' => $this->card->id, 'amount' => 1000.0, 'terminal_id' => $this->terminal->id]])
            ->assertStatus(422);

        // Cancelada completa: tampoco.
        $this->actingAs($this->cajero1)->postJson("/api/v1/sales/{$full->id}/cancel", [
            'reason_code' => 'otro', 'cash_session_id' => $this->session->id,
        ])->assertOk();
        $this->correct($this->cajero1, $full, [['payment_method_id' => $this->transfer->id, 'amount' => 500.0]])
            ->assertStatus(422);
    }

    public function test_la_suma_debe_ser_igual_a_lo_cobrado(): void
    {
        $this->correct($this->cajero1, $this->cashSale(), [['payment_method_id' => $this->transfer->id, 'amount' => 450.0]])
            ->assertStatus(422);
    }

    public function test_tarjeta_pide_terminal_activa_de_la_tienda(): void
    {
        $sale       = $this->cashSale();
        $otherStore = Terminal::create(['store_id' => $this->storeB->id, 'name' => 'B', 'commission_percent' => 3, 'active' => true]);
        $inactive   = Terminal::create(['store_id' => $this->storeA->id, 'name' => 'Vieja', 'commission_percent' => 3, 'active' => false]);

        foreach ([null, $otherStore->id, $inactive->id] as $terminalId) {
            $this->correct($this->cajero1, $sale, [['payment_method_id' => $this->card->id, 'amount' => 500.0, 'terminal_id' => $terminalId]])
                ->assertStatus(422);
        }
    }

    public function test_mixto_efectivo_mas_transferencia(): void
    {
        $sale = $this->makeSale([['payment_method_id' => $this->card->id, 'amount' => 500.0, 'terminal_id' => $this->terminal->id]]);

        $this->correct($this->cajero1, $sale, [
            ['payment_method_id' => $this->cash->id, 'amount' => 300.0],
            ['payment_method_id' => $this->transfer->id, 'amount' => 200.0],
        ])->assertOk();

        $sale->refresh();
        $this->assertEquals(300.0, $sale->cash_received);
        $this->assertEquals(0.0, $sale->change_amount);
        $this->assertEquals(0.0, $sale->commission_amount);
        $this->assertNull(Payment::where('sale_id', $sale->id)->whereNotNull('terminal_id')->first());
    }

    public function test_formas_no_permitidas(): void
    {
        $sale    = $this->cashSale();
        $dollars = PaymentMethod::create(['name' => 'Dólares', 'active' => true]);

        $shapes = [
            [['payment_method_id' => $this->card->id, 'amount' => 250.0, 'terminal_id' => $this->terminal->id], ['payment_method_id' => $this->cash->id, 'amount' => 250.0]],
            [['payment_method_id' => $this->transfer->id, 'amount' => 250.0], ['payment_method_id' => $this->transfer->id, 'amount' => 250.0]],
            [['payment_method_id' => $dollars->id, 'amount' => 500.0]],
            [['payment_method_id' => $this->cash->id, 'amount' => 100.0], ['payment_method_id' => $this->transfer->id, 'amount' => 200.0], ['payment_method_id' => $this->transfer->id, 'amount' => 200.0]],
        ];
        foreach ($shapes as $payments) {
            $this->correct($this->cajero1, $sale, $payments)->assertStatus(422);
        }
    }

    public function test_tarjeta_a_efectivo_llena_lo_recibido(): void
    {
        $sale = $this->makeSale([['payment_method_id' => $this->card->id, 'amount' => 500.0, 'terminal_id' => $this->terminal->id]]);

        $this->correct($this->cajero1, $sale, [['payment_method_id' => $this->cash->id, 'amount' => 500.0]])->assertOk();

        $sale->refresh();
        $this->assertEquals(500.0, $sale->cash_received);
        $this->assertEquals(0.0, $sale->change_amount);
        $this->assertEquals(0.0, $sale->commission_amount);
    }

    public function test_venta_con_dolares_solo_se_corrige_a_tarjeta_o_transferencia(): void
    {
        $sale = $this->makeSale(
            [['payment_method_id' => $this->cash->id, 'amount' => 500.0]],
            ['cash_received_usd' => 30, 'exchange_rate' => 17.5, 'cash_received' => 525, 'change_amount' => 25],
        );

        $this->correct($this->cajero1, $sale, [
            ['payment_method_id' => $this->cash->id, 'amount' => 300.0],
            ['payment_method_id' => $this->transfer->id, 'amount' => 200.0],
        ])->assertStatus(422);

        $this->correct($this->cajero1, $sale, $this->toCard())->assertOk();
        $sale->refresh();
        $this->assertNull($sale->cash_received_usd);
        $this->assertNull($sale->exchange_rate);
        $this->assertEquals(0.0, (float) $this->cashReportRow()['expected_usd']);
    }

    public function test_el_esperado_del_corte_se_actualiza(): void
    {
        $sale = $this->cashSale();
        $this->assertEquals(500.0, (float) $this->cashReportRow()['expected_cash']);

        $this->correct($this->cajero1, $sale, $this->toCard())->assertOk();

        $row = $this->cashReportRow();
        $this->assertEquals(0.0, (float) $row['expected_cash']);
        $this->assertEquals(500.0, (float) $row['total_card']);
    }

    public function test_respeta_restricciones_de_pago_del_producto(): void
    {
        $cashOnly = $this->makeSale([['payment_method_id' => $this->cash->id, 'amount' => 500.0]], [], $this->makeProduct(['allow_cash' => true, 'allow_card' => false]));
        $this->correct($this->cajero1, $cashOnly, $this->toCard())->assertStatus(422);

        $cardOnly = $this->makeSale(
            [['payment_method_id' => $this->card->id, 'amount' => 500.0, 'terminal_id' => $this->terminal->id]],
            [],
            $this->makeProduct(['allow_cash' => false, 'allow_card' => true]),
        );
        $this->correct($this->cajero1, $cardOnly, [['payment_method_id' => $this->transfer->id, 'amount' => 500.0]])->assertStatus(422);
        $this->assertSame($this->card->id, (int) Payment::where('sale_id', $cardOnly->id)->sole()->payment_method_id);
    }

    public function test_respeta_la_promo_solo_efectivo(): void
    {
        $product = $this->makeProduct();
        $sale    = $this->makeSale([['payment_method_id' => $this->cash->id, 'amount' => 500.0]], [], $product);
        $promo   = ProductPromotion::create([
            'product_id' => $product->id, 'name' => 'Solo efectivo', 'type' => 'nxm',
            'buy_n' => 2, 'pay_m' => 1, 'allow_cash' => true, 'allow_card' => false,
        ]);
        SaleItem::where('sale_id', $sale->id)->update(['applied_promotion_id' => $promo->id, 'promo_name' => 'Solo efectivo']);

        $this->correct($this->cajero1, $sale, $this->toCard())
            ->assertStatus(422)
            ->assertJsonFragment(['success' => false]);
    }

    public function test_venta_sin_pagos_no_se_corrige(): void
    {
        $sale = Sale::create([
            'store_id' => $this->storeA->id, 'user_id' => $this->cajero1->id,
            'subtotal' => 500, 'discount' => 0, 'total' => 500, 'status' => Sale::STATUS_COMPLETED,
        ]);

        $this->correct($this->admin, $sale, $this->toCard())->assertStatus(422);
    }

    public function test_sin_cambios_422(): void
    {
        $this->correct($this->cajero1, $this->cashSale(), [['payment_method_id' => $this->cash->id, 'amount' => 500.0]])
            ->assertStatus(422);
    }

    public function test_la_lista_trae_el_estado_de_la_caja(): void
    {
        $sale = $this->cashSale();

        $row = collect($this->actingAs($this->cajero1)->getJson('/api/v1/sales')->assertOk()->json('data.data'))->firstWhere('id', $sale->id);
        $this->assertSame('open', $row['register_session_status']);

        $this->session->update(['status' => 'closed', 'closed_at' => now()]);
        $this->actingAs($this->cajero1)->getJson("/api/v1/sales/{$sale->id}")
            ->assertOk()
            ->assertJsonPath('data.register_session_status', 'closed');
    }

    // ── Revisión de seguridad (2026-09-30) ──────────────────────────────────────

    private function cardSale(): Sale
    {
        return $this->makeSale([['payment_method_id' => $this->card->id, 'amount' => 500.0, 'terminal_id' => $this->terminal->id]]);
    }

    private function sessionFor(User $user): CashRegisterSession
    {
        $register = CashRegister::create(['store_id' => $this->storeA->id, 'name' => 'Caja ' . $user->id, 'active' => true]);

        return CashRegisterSession::create([
            'register_id' => $register->id, 'user_id' => $user->id,
            'opening_cash' => 0, 'status' => 'open', 'opened_at' => now(),
        ]);
    }

    public function test_el_motivo_es_obligatorio(): void
    {
        $this->correct($this->cajero1, $this->cashSale(), $this->toCard(), null)->assertStatus(422);
    }

    public function test_otro_cajero_no_mete_efectivo_a_la_caja_ajena(): void
    {
        // Tarjeta → efectivo en la caja de cajero1: cajero2 no (inventaría
        // efectivo en un cajón ajeno para luego cancelarlo en el suyo).
        $sale = $this->cardSale();
        $this->correct($this->cajero2, $sale, [['payment_method_id' => $this->cash->id, 'amount' => 500.0]])
            ->assertStatus(403);
        $this->assertSame($this->card->id, (int) Payment::where('sale_id', $sale->id)->sole()->payment_method_id);

        // Sí: el dueño de la caja y el gerente.
        $this->correct($this->cajero1, $sale, [['payment_method_id' => $this->cash->id, 'amount' => 500.0]])->assertOk();
        $this->correct($this->gerente, $this->cardSale(), [['payment_method_id' => $this->cash->id, 'amount' => 500.0]])->assertOk();
    }

    public function test_venta_sin_caja_solo_admin(): void
    {
        $sale = Sale::create([
            'store_id' => $this->storeA->id, 'user_id' => $this->cajero1->id,
            'subtotal' => 500, 'discount' => 0, 'total' => 500, 'status' => Sale::STATUS_COMPLETED,
        ]);
        Payment::create(['sale_id' => $sale->id, 'payment_method_id' => $this->cash->id, 'amount' => 500, 'commission_amount' => 0]);

        $this->correct($this->gerente, $sale, $this->toCard())->assertStatus(403);
        $this->correct($this->admin, $sale, $this->toCard())->assertOk();
    }

    public function test_corregir_y_luego_cancelar_cuadra_el_cajon(): void
    {
        // Tarjeta → efectivo (el dueño de la caja) y cancelar: sale efectivo.
        $sale = $this->cardSale();
        $this->correct($this->cajero1, $sale, [['payment_method_id' => $this->cash->id, 'amount' => 500.0]])->assertOk();
        $this->actingAs($this->cajero1)->postJson("/api/v1/sales/{$sale->id}/cancel", [
            'reason_code' => 'otro', 'cash_session_id' => $this->session->id,
        ])->assertOk();
        $this->assertEquals(500.0, (float) \App\Models\SaleCancellation::where('sale_id', $sale->id)->sole()->amount_refunded);
        $this->assertDatabaseHas('cash_movements', ['register_session_id' => $this->session->id, 'type' => 'salida', 'amount' => 500]);

        // Efectivo → tarjeta y cancelar: no sale nada del cajón.
        $other = $this->cashSale();
        $this->correct($this->cajero1, $other, $this->toCard())->assertOk();
        $this->actingAs($this->cajero1)->postJson("/api/v1/sales/{$other->id}/cancel", [
            'reason_code' => 'otro', 'cash_session_id' => $this->session->id,
        ])->assertOk();
        $this->assertNull(\App\Models\SaleCancellation::where('sale_id', $other->id)->sole()->cash_movement_id);

        // El cajón quedó en su apertura: 500 entró (corregido) y 500 salió.
        $this->assertEquals(0.0, (float) $this->cashReportRow()['expected_cash']);
    }

    public function test_la_salida_de_una_cancelacion_va_a_tu_propia_caja_abierta(): void
    {
        $sale    = $this->cashSale();
        $ownOf2  = $this->sessionFor($this->cajero2);

        // cajero2 no puede mandar la salida a la caja de cajero1…
        $this->actingAs($this->cajero2)->postJson("/api/v1/sales/{$sale->id}/cancel", [
            'reason_code' => 'otro', 'cash_session_id' => $this->session->id,
        ])->assertStatus(403);

        // …ni a una caja cerrada…
        $ownOf2->update(['status' => 'closed', 'closed_at' => now()]);
        $this->actingAs($this->cajero2)->postJson("/api/v1/sales/{$sale->id}/cancel", [
            'reason_code' => 'otro', 'cash_session_id' => $ownOf2->id,
        ])->assertStatus(422);
        $this->assertSame(Sale::STATUS_COMPLETED, $sale->fresh()->status);

        // …pero sí a la suya abierta.
        $open2 = $this->sessionFor($this->cajero2);
        $this->actingAs($this->cajero2)->postJson("/api/v1/sales/{$sale->id}/cancel", [
            'reason_code' => 'otro', 'cash_session_id' => $open2->id,
        ])->assertOk();
        $this->assertDatabaseHas('cash_movements', ['register_session_id' => $open2->id, 'type' => 'salida', 'amount' => 500]);
    }
}
