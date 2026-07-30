<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\CashRegister;
use App\Models\CashRegisterSession;
use App\Models\Company;
use App\Models\Customer;
use App\Models\Payment;
use App\Models\PaymentMethod;
use App\Models\Sale;
use App\Models\Store;
use App\Models\Supply;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Corte en pesos Y dólares (Joel 2026-07-30): el esperado se separa por moneda
 * (los dólares físicos se quedan íntegros en el cajón — el cambio siempre se da
 * en MXN), el cierre captura `closing_cash_usd` y el reporte expone diferencias
 * por moneda. Compat: sesiones sin dólares capturados conservan la `difference`
 * de siempre (un solo número en MXN).
 */
class CashCutUsdSplitTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;
    private Store $store;
    private CashRegister $register;
    private User $admin;
    private PaymentMethod $cash;
    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();

        $this->company  = Company::create(['name' => 'Tadaima Test']);
        $this->store    = Store::create(['company_id' => $this->company->id, 'name' => 'Tienda Test', 'active' => true]);
        $this->register = CashRegister::create(['store_id' => $this->store->id, 'name' => 'Caja Test', 'active' => true]);

        $this->admin = User::create([
            'name' => 'Admin', 'email' => 'admin@test.com', 'password' => bcrypt('x'),
            'company_id' => $this->company->id, 'store_id' => $this->store->id, 'active' => true,
        ]);
        $roleId = DB::table('roles')->where('name', 'admin')->value('id')
            ?? DB::table('roles')->insertGetId(['name' => 'admin', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('model_has_roles')->insert([
            'role_id' => $roleId, 'model_type' => User::class, 'model_id' => $this->admin->id,
        ]);

        $this->cash     = PaymentMethod::create(['name' => 'Efectivo', 'active' => true]);
        $this->customer = Customer::create(['name' => 'Cliente USD']);
    }

    private function openSession(float $openingCash = 500): CashRegisterSession
    {
        return CashRegisterSession::create([
            'register_id'  => $this->register->id,
            'user_id'      => $this->admin->id,
            'opening_cash' => $openingCash,
            'status'       => CashRegisterSession::STATUS_OPEN,
            'opened_at'    => now()->subHour(),
        ]);
    }

    /** Venta en efectivo; con $usd > 0 simula pago (parcial o total) en dólares. */
    private function makeCashSale(CashRegisterSession $session, float $total, float $usd = 0, float $tc = 15.5): Sale
    {
        $sale = Sale::create([
            'store_id'            => $this->store->id,
            'register_session_id' => $session->id,
            'user_id'             => $this->admin->id,
            'customer_id'         => $this->customer->id,
            'subtotal'            => $total,
            'discount'            => 0,
            'total'               => $total,
            'status'              => Sale::STATUS_COMPLETED,
            'cash_received'       => $total,
            'change_amount'       => 0,
            'cash_received_usd'   => $usd > 0 ? $usd : null,
            'exchange_rate'       => $usd > 0 ? $tc : null,
        ]);
        Payment::create([
            'sale_id'           => $sale->id,
            'payment_method_id' => $this->cash->id,
            'amount'            => $total,
            'commission_amount' => 0,
        ]);

        return $sale;
    }

    private function reportRow(int $sessionId): array
    {
        $sessions = $this->actingAs($this->admin)
            ->getJson('/api/v1/reports/cash?from=' . now()->subDay()->toDateString() . '&to=' . now()->addDay()->toDateString())
            ->assertOk()
            ->json('data.sessions');

        $row = collect($sessions)->firstWhere('id', $sessionId);
        $this->assertNotNull($row);

        return $row;
    }

    public function test_esperado_se_separa_en_pesos_y_dolares(): void
    {
        $session = $this->openSession(500);
        // US$20 @ 15.50 cubren la venta completa de $310; venta B pura MXN.
        $this->makeCashSale($session, 310, usd: 20, tc: 15.5);
        $this->makeCashSale($session, 100);

        $row = $this->reportRow($session->id);

        $this->assertEquals(910.0, (float) $row['expected_cash']);       // total (compat)
        $this->assertEquals(310.0, (float) $row['usd_mxn_equiv']);
        $this->assertEquals(600.0, (float) $row['expected_cash_mxn']);   // pesos físicos
        $this->assertEquals(20.0, (float) $row['expected_usd']);         // dólares físicos
        $this->assertEquals(20.0, (float) $row['total_usd_received']);   // campo legacy intacto
    }

    public function test_cierre_captura_dolares_y_reporta_diferencias_por_moneda(): void
    {
        $session = $this->openSession(500);
        $this->makeCashSale($session, 310, usd: 20, tc: 15.5);
        $this->makeCashSale($session, 100);

        $this->actingAs($this->admin)
            ->postJson('/api/v1/cash/close', [
                'closing_cash'     => 590,
                'closing_cash_usd' => 18,
                'local_date'       => now()->toDateString(),
            ])
            ->assertOk();

        $this->assertDatabaseHas('cash_register_sessions', [
            'id'               => $session->id,
            'closing_cash_usd' => 18,
        ]);

        $row = $this->reportRow($session->id);

        $this->assertEquals(18.0, (float) $row['closing_cash_usd']);
        $this->assertEquals(-10.0, (float) $row['difference_mxn']);      // 590 − 600
        $this->assertEquals(-2.0, (float) $row['difference_usd']);       // 18 − 20
        // Total en MXN: −10 + (−2 × 15.50 tc promedio de la sesión) = −41.
        $this->assertEquals(-41.0, (float) $row['difference']);
    }

    public function test_cierre_sin_dolares_capturados_conserva_diferencia_legacy(): void
    {
        $session = $this->openSession(500);
        $this->makeCashSale($session, 310, usd: 20, tc: 15.5);
        $this->makeCashSale($session, 100);

        // Cliente viejo / cajero que no captura dólares: solo closing_cash.
        $this->actingAs($this->admin)
            ->postJson('/api/v1/cash/close', [
                'closing_cash' => 900,
                'local_date'   => now()->toDateString(),
            ])
            ->assertOk();

        $row = $this->reportRow($session->id);

        $this->assertNull($row['closing_cash_usd']);
        $this->assertNull($row['difference_mxn']);
        $this->assertNull($row['difference_usd']);
        $this->assertEquals(-10.0, (float) $row['difference']);          // 900 − 910, como siempre
        // El desglose del esperado sí sale (informativo) aunque no se capturó.
        $this->assertEquals(600.0, (float) $row['expected_cash_mxn']);
        $this->assertEquals(20.0, (float) $row['expected_usd']);
    }

    public function test_insumo_de_caja_resta_una_sola_vez_y_solo_del_lado_mxn(): void
    {
        $session = $this->openSession(500);
        $this->makeCashSale($session, 310, usd: 20, tc: 15.5);

        $supply = Supply::create([
            'company_id' => $this->company->id, 'name' => 'Cinta canela',
            'category' => 'Empaque', 'unit' => 'rollo',
        ]);
        $this->actingAs($this->admin)->postJson('/api/v1/supplies/movements', [
            'supply_id' => $supply->id, 'quantity' => 1, 'amount' => 80,
        ])->assertStatus(201);

        $row = $this->reportRow($session->id);

        // 500 + 310 − 80 = 730 total; el insumo salió en PESOS del cajón.
        $this->assertEquals(730.0, (float) $row['expected_cash']);
        $this->assertEquals(420.0, (float) $row['expected_cash_mxn']);
        $this->assertEquals(20.0, (float) $row['expected_usd']);
        $this->assertEquals(80.0, (float) $row['total_supplies']);
        $this->assertEquals(80.0, (float) $row['total_salidas']);
    }

    public function test_closing_cash_usd_negativo_rechazado(): void
    {
        $this->openSession(500);

        $this->actingAs($this->admin)
            ->postJson('/api/v1/cash/close', [
                'closing_cash'     => 100,
                'closing_cash_usd' => -5,
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['closing_cash_usd']);
    }

    public function test_cash_detail_expone_usd_por_ticket(): void
    {
        $session = $this->openSession(500);
        $this->makeCashSale($session, 310, usd: 20, tc: 15.5);

        $this->actingAs($this->admin)
            ->getJson("/api/v1/reports/cash/{$session->id}/detail")
            ->assertOk()
            ->assertJsonPath('data.tickets.0.cash_received_usd', 20)
            ->assertJsonPath('data.tickets.0.exchange_rate', 15.5)
            ->assertJsonPath('data.tickets.0.cash_received', 310)
            ->assertJsonPath('data.tickets.0.change_amount', 0);
    }
}
