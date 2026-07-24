<?php

namespace Tests\Feature;

use App\Models\CashRegister;
use App\Models\CashRegisterSession;
use App\Models\Company;
use App\Models\Customer;
use App\Models\Payment;
use App\Models\PaymentMethod;
use App\Models\PreSaleOrder;
use App\Models\PreSaleOrderPayment;
use App\Models\Sale;
use App\Models\Store;
use App\Models\User;
use App\Support\DateRange;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Filtro de fechas de GET /reports/cash (Cortes) — bugs QA 2026-06-11:
 *
 * 1. `whereDate('opened_at')` comparaba la fecha UTC del timestamp: una caja
 *    abierta a las 7pm Tijuana (= 02:00 UTC del día siguiente) desaparecía
 *    del filtro "hoy". Ahora el rango se convierte zona-negocio → UTC con
 *    DateRange (mismo patrón que ventas).
 *
 * 2. Solo filtraba por fecha de APERTURA: un corte que abre un día y cierra
 *    al siguiente (o sigue abierto varios días) no salía en los días
 *    posteriores. Ahora se filtra por TRASLAPE del rango con la vida de la
 *    sesión [opened_at, closed_at|ahora].
 */
class CashReportRangeTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;
    private Store $store;
    private CashRegister $register;
    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->company = Company::create(['name' => 'Tadaima Test']);
        $this->store = Store::create([
            'company_id' => $this->company->id,
            'name' => 'Tienda Test',
            'active' => true,
        ]);
        $this->register = CashRegister::create([
            'store_id' => $this->store->id,
            'name' => 'Caja Test',
            'active' => true,
        ]);
        $this->admin = User::create([
            'name' => 'Admin',
            'email' => 'admin@test.com',
            'password' => bcrypt('password'),
            'company_id' => $this->company->id,
            'store_id' => $this->store->id,
            'active' => true,
        ]);
        $roleId = DB::table('roles')->where('name', 'admin')->value('id')
            ?? DB::table('roles')->insertGetId([
                'name' => 'admin',
                'guard_name' => 'api',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        DB::table('model_has_roles')->insert([
            'role_id' => $roleId,
            'model_type' => User::class,
            'model_id' => $this->admin->id,
        ]);
    }

    private function makeSession(Carbon $openedAtUtc, ?Carbon $closedAtUtc): CashRegisterSession
    {
        return CashRegisterSession::create([
            'register_id' => $this->register->id,
            'user_id' => $this->admin->id,
            'opening_cash' => 0,
            'status' => $closedAtUtc
                ? CashRegisterSession::STATUS_CLOSED
                : CashRegisterSession::STATUS_OPEN,
            'opened_at' => $openedAtUtc,
            'closed_at' => $closedAtUtc,
        ]);
    }

    private function sessionIdsFor(string $from, string $to): array
    {
        $res = $this->actingAs($this->admin)
            ->getJson("/api/v1/reports/cash?from={$from}&to={$to}")
            ->assertOk()
            ->json('data.sessions');

        return array_column($res ?? [], 'id');
    }

    public function test_corte_nocturno_aparece_en_el_dia_de_negocio(): void
    {
        $tz = DateRange::timezone();
        // Abierta 7pm y cerrada 11pm hora del negocio: en UTC ambas caen en
        // el día SIGUIENTE (Tijuana UTC-7/-8). El whereDate viejo la perdía.
        $hoy = Carbon::parse('2026-06-11 19:00:00', $tz);
        $session = $this->makeSession($hoy->copy()->utc(), $hoy->copy()->addHours(4)->utc());

        $this->assertContains($session->id, $this->sessionIdsFor('2026-06-11', '2026-06-11'));
        $this->assertNotContains($session->id, $this->sessionIdsFor('2026-06-10', '2026-06-10'));
    }

    public function test_corte_que_cruza_medianoche_sale_en_ambos_dias(): void
    {
        $tz = DateRange::timezone();
        // Abre 10pm del día 10, cierra 1am del día 11 (hora negocio).
        $apertura = Carbon::parse('2026-06-10 22:00:00', $tz);
        $cierre   = Carbon::parse('2026-06-11 01:00:00', $tz);
        $session = $this->makeSession($apertura->utc(), $cierre->utc());

        $this->assertContains($session->id, $this->sessionIdsFor('2026-06-10', '2026-06-10'));
        $this->assertContains($session->id, $this->sessionIdsFor('2026-06-11', '2026-06-11'));
        $this->assertNotContains($session->id, $this->sessionIdsFor('2026-06-12', '2026-06-12'));
    }

    public function test_caja_aun_abierta_de_dias_anteriores_sigue_apareciendo(): void
    {
        $tz = DateRange::timezone();
        // Abrió hace 3 días y nadie la ha cerrado → debe salir en el filtro
        // de hoy (su vida sigue corriendo).
        $apertura = Carbon::parse('2026-06-08 10:00:00', $tz);
        $session = $this->makeSession($apertura->utc(), null);

        $this->assertContains($session->id, $this->sessionIdsFor('2026-06-11', '2026-06-11'));
        $this->assertContains($session->id, $this->sessionIdsFor('2026-06-08', '2026-06-08'));
        // Antes de abrir, no existe.
        $this->assertNotContains($session->id, $this->sessionIdsFor('2026-06-07', '2026-06-07'));
    }

    public function test_cerrar_caja_guarda_local_date_mandada_por_la_ui(): void
    {
        $tz = DateRange::timezone();
        CashRegisterSession::create([
            'register_id'  => $this->register->id,
            'user_id'      => $this->admin->id,
            'opening_cash' => 100,
            'status'       => CashRegisterSession::STATUS_OPEN,
            'opened_at'    => Carbon::parse('2026-06-11 19:00:00', $tz)->utc(),
        ]);

        $res = $this->actingAs($this->admin)
            ->postJson('/api/v1/cash/close', [
                'closing_cash' => 150,
                'local_date'   => '2026-06-11',
            ])
            ->assertOk();

        $this->assertSame('2026-06-11', $res->json('data.local_date'));
        $this->assertDatabaseHas('cash_register_sessions', [
            'id'         => $res->json('data.id'),
            'local_date' => '2026-06-11',
        ]);
    }

    public function test_cerrar_caja_sin_local_date_usa_fallback_zona_negocio(): void
    {
        CashRegisterSession::create([
            'register_id'  => $this->register->id,
            'user_id'      => $this->admin->id,
            'opening_cash' => 100,
            'status'       => CashRegisterSession::STATUS_OPEN,
            'opened_at'    => now()->subHours(2),
        ]);

        $res = $this->actingAs($this->admin)
            ->postJson('/api/v1/cash/close', ['closing_cash' => 100])
            ->assertOk();

        $this->assertSame(
            now(DateRange::timezone())->toDateString(),
            $res->json('data.local_date'),
        );
    }

    public function test_local_date_manda_sobre_el_traslape_utc(): void
    {
        $tz = DateRange::timezone();
        // Corte de las 11:30pm del día 11: closed_at en UTC (y hasta su vida
        // en zona negocio si cerrara pasada la medianoche) tocaría el día 12.
        // Con local_date=06-11 el corte pertenece SOLO al 11.
        $session = CashRegisterSession::create([
            'register_id'  => $this->register->id,
            'user_id'      => $this->admin->id,
            'opening_cash' => 0,
            'status'       => CashRegisterSession::STATUS_CLOSED,
            'opened_at'    => Carbon::parse('2026-06-11 19:00:00', $tz)->utc(),
            'closed_at'    => Carbon::parse('2026-06-12 00:30:00', $tz)->utc(),
            'local_date'   => '2026-06-11',
        ]);

        $this->assertContains($session->id, $this->sessionIdsFor('2026-06-11', '2026-06-11'));
        // Sin local_date, el traslape lo metería también al día 12.
        $this->assertNotContains($session->id, $this->sessionIdsFor('2026-06-12', '2026-06-12'));
    }

    public function test_expected_cash_usa_solo_dinero_fisico_y_no_tarjeta(): void
    {
        $cash = PaymentMethod::create(['name' => 'Efectivo', 'active' => true]);
        $card = PaymentMethod::create(['name' => 'Tarjeta Crédito', 'active' => true]);
        $customer = Customer::create(['name' => 'Cliente Corte']);

        $session = CashRegisterSession::create([
            'register_id'  => $this->register->id,
            'user_id'      => $this->admin->id,
            'opening_cash' => 500,
            'status'       => CashRegisterSession::STATUS_OPEN,
            'opened_at'    => now()->subHour(),
        ]);

        $cashSale = Sale::create([
            'store_id'            => $this->store->id,
            'register_session_id' => $session->id,
            'user_id'             => $this->admin->id,
            'customer_id'         => $customer->id,
            'subtotal'            => 100,
            'discount'            => 0,
            'total'               => 100,
            'status'              => Sale::STATUS_COMPLETED,
        ]);
        Payment::create([
            'sale_id'            => $cashSale->id,
            'payment_method_id'  => $cash->id,
            'amount'             => 100,
            'commission_amount'  => 0,
        ]);

        $cardSale = Sale::create([
            'store_id'            => $this->store->id,
            'register_session_id' => $session->id,
            'user_id'             => $this->admin->id,
            'customer_id'         => $customer->id,
            'subtotal'            => 250,
            'discount'            => 0,
            'total'               => 250,
            'status'              => Sale::STATUS_COMPLETED,
        ]);
        Payment::create([
            'sale_id'            => $cardSale->id,
            'payment_method_id'  => $card->id,
            'amount'             => 250,
            'commission_amount'  => 0,
        ]);

        $order = PreSaleOrder::create([
            'code'        => 'PREV-CORTE-001',
            'store_id'    => $this->store->id,
            'user_id'     => $this->admin->id,
            'customer_id' => $customer->id,
            'status'      => PreSaleOrder::STATUS_PENDING,
        ]);
        PreSaleOrderPayment::create([
            'pre_sale_order_id' => $order->id,
            'amount'            => 80,
            'payment_method_id' => $cash->id,
            'cashier_id'        => $this->admin->id,
            'notes'             => 'Anticipo de prueba',
        ]);

        DB::table('cash_movements')->insert([
            'register_session_id' => $session->id,
            'type'                => 'salida',
            'amount'              => 30,
            'description'         => 'Retiro parcial',
            'created_at'          => now(),
        ]);

        $report = $this->actingAs($this->admin)
            ->getJson('/api/v1/reports/cash?from=' . now()->toDateString() . '&to=' . now()->toDateString())
            ->assertOk()
            ->json('data.sessions');

        $row = collect($report)->firstWhere('id', $session->id);

        $this->assertNotNull($row);
        $this->assertEquals(350.0, (float) $row['total_sales']);
        $this->assertEquals(80.0, (float) $row['total_pre_sale_payments']);
        $this->assertEquals(180.0, (float) $row['cash_collected']);
        $this->assertEquals(650.0, (float) $row['expected_cash']);
    }

    /**
     * Joel 2026-07-23: el corte debe ser SOLO efectivo. El CASE viejo excluía
     * únicamente '%tarjeta%', así que una Transferencia (método sembrado por
     * default) contaba como dinero físico en el cajón → "faltante" fantasma.
     */
    public function test_transferencia_no_entra_al_esperado_del_cajon(): void
    {
        $cash     = PaymentMethod::create(['name' => 'Efectivo', 'active' => true]);
        $card     = PaymentMethod::create(['name' => 'Tarjeta Crédito', 'active' => true]);
        $transfer = PaymentMethod::create(['name' => 'Transferencia', 'active' => true]);
        $customer = Customer::create(['name' => 'Cliente Transferencia']);

        $session = CashRegisterSession::create([
            'register_id'  => $this->register->id,
            'user_id'      => $this->admin->id,
            'opening_cash' => 500,
            'status'       => CashRegisterSession::STATUS_OPEN,
            'opened_at'    => now()->subHour(),
        ]);

        foreach ([[$cash, 100], [$transfer, 300], [$card, 250]] as [$method, $amount]) {
            $sale = Sale::create([
                'store_id'            => $this->store->id,
                'register_session_id' => $session->id,
                'user_id'             => $this->admin->id,
                'customer_id'         => $customer->id,
                'subtotal'            => $amount,
                'discount'            => 0,
                'total'               => $amount,
                'status'              => Sale::STATUS_COMPLETED,
            ]);
            Payment::create([
                'sale_id'           => $sale->id,
                'payment_method_id' => $method->id,
                'amount'            => $amount,
                'commission_amount' => 0,
            ]);
        }

        $order = PreSaleOrder::create([
            'code'        => 'PREV-TRANSFER-001',
            'store_id'    => $this->store->id,
            'user_id'     => $this->admin->id,
            'customer_id' => $customer->id,
            'status'      => PreSaleOrder::STATUS_PENDING,
        ]);
        PreSaleOrderPayment::create([
            'pre_sale_order_id' => $order->id,
            'amount'            => 80,
            'payment_method_id' => $cash->id,
            'cashier_id'        => $this->admin->id,
        ]);
        PreSaleOrderPayment::create([
            'pre_sale_order_id' => $order->id,
            'amount'            => 90,
            'payment_method_id' => $transfer->id,
            'cashier_id'        => $this->admin->id,
        ]);

        DB::table('cash_movements')->insert([
            'register_session_id' => $session->id,
            'type'                => 'salida',
            'amount'              => 30,
            'description'         => 'Retiro parcial',
            'created_at'          => now(),
        ]);

        $row = collect($this->actingAs($this->admin)
            ->getJson('/api/v1/reports/cash?from=' . now()->toDateString() . '&to=' . now()->toDateString())
            ->assertOk()
            ->json('data.sessions'))->firstWhere('id', $session->id);

        $this->assertNotNull($row);
        $this->assertEquals(650.0, (float) $row['total_sales']);
        $this->assertEquals(170.0, (float) $row['total_pre_sale_payments']);
        // Al cajón solo entraron 100 (venta) + 80 (anticipo) en efectivo.
        $this->assertEquals(180.0, (float) $row['cash_collected']);
        $this->assertEquals(650.0, (float) $row['expected_cash']);
        // Desglose informativo de lo que quedó FUERA del cajón.
        $this->assertEquals(250.0, (float) $row['total_card']);
        $this->assertEquals(390.0, (float) $row['total_transfer']);
    }

    /**
     * La clasificación es de INCLUSIÓN (efectivo/dólares), no de exclusión:
     * un método futuro ("Depósito bancario") queda fuera del cajón solo, y el
     * legacy "Dólares" (retirado del dropdown 2026-05-28, con datos vivos)
     * sigue contando como dinero físico.
     */
    public function test_metodo_desconocido_fuera_del_cajon_y_dolares_dentro(): void
    {
        $usd     = PaymentMethod::create(['name' => 'Dólares', 'active' => true]);
        $deposit = PaymentMethod::create(['name' => 'Depósito bancario', 'active' => true]);
        $customer = Customer::create(['name' => 'Cliente Métodos']);

        $session = CashRegisterSession::create([
            'register_id'  => $this->register->id,
            'user_id'      => $this->admin->id,
            'opening_cash' => 0,
            'status'       => CashRegisterSession::STATUS_OPEN,
            'opened_at'    => now()->subHour(),
        ]);

        foreach ([[$usd, 200], [$deposit, 150]] as [$method, $amount]) {
            $sale = Sale::create([
                'store_id'            => $this->store->id,
                'register_session_id' => $session->id,
                'user_id'             => $this->admin->id,
                'customer_id'         => $customer->id,
                'subtotal'            => $amount,
                'discount'            => 0,
                'total'               => $amount,
                'status'              => Sale::STATUS_COMPLETED,
            ]);
            Payment::create([
                'sale_id'           => $sale->id,
                'payment_method_id' => $method->id,
                'amount'            => $amount,
                'commission_amount' => 0,
            ]);
        }

        $row = collect($this->actingAs($this->admin)
            ->getJson('/api/v1/reports/cash?from=' . now()->toDateString() . '&to=' . now()->toDateString())
            ->assertOk()
            ->json('data.sessions'))->firstWhere('id', $session->id);

        $this->assertNotNull($row);
        $this->assertEquals(200.0, (float) $row['cash_collected']);
        $this->assertEquals(200.0, (float) $row['expected_cash']);
        $this->assertEquals(0.0, (float) $row['total_card']);
        // El desconocido cae al resto no-efectivo no-tarjeta.
        $this->assertEquals(150.0, (float) $row['total_transfer']);
    }
}
