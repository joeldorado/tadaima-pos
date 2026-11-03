<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\CashRegister;
use App\Models\CashRegisterSession;
use App\Models\Company;
use App\Models\Customer;
use App\Models\PaymentMethod;
use App\Models\PreSaleOrder;
use App\Models\PreSaleOrderPayment;
use App\Models\Store;
use App\Models\Supply;
use App\Models\SupplyMovement;
use App\Models\User;
use App\Support\DateRange;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use PHPUnit\Framework\Attributes\DataProvider;
use Tests\TestCase;

/**
 * GET /reports/cash/{session}/detail — horas del desglose (2026-11-03).
 *
 * `movements`, `pre_sale_payments` y `supply_purchases` salen de DB::table, que
 * devuelve el timestamp como texto sin zona ("2026-11-03 21:23:20"). El navegador
 * lo interpretaba como hora LOCAL y Cortes de Caja enseñaba 9:23 p.m. para un
 * movimiento de la 1:23 p.m. en Tijuana. El JSON debe llevar la zona, igual que
 * `tickets[].sold_at` y `session.opened_at`.
 */
class CashDetailTimezoneTest extends TestCase
{
    use RefreshDatabase;

    /** 1:23 p.m. en Tijuana (PST, UTC-8 desde el 1 de noviembre). */
    private const STORED_UTC = '2026-11-03 21:23:20';

    private const EXPECTED_ISO = '2026-11-03T21:23:20.000000Z';

    private User $admin;

    private CashRegisterSession $session;

    protected function setUp(): void
    {
        parent::setUp();

        Carbon::setTestNow(Carbon::parse('2026-11-03 18:00:00', DateRange::timezone()));

        $company = Company::create(['name' => 'Tadaima Test']);
        $store = Store::create(['company_id' => $company->id, 'name' => 'Tienda Test', 'active' => true]);
        $register = CashRegister::create(['store_id' => $store->id, 'name' => 'Caja Test', 'active' => true]);

        $this->admin = User::create([
            'name' => 'Admin', 'email' => 'admin@test.com', 'password' => bcrypt('password'),
            'company_id' => $company->id, 'store_id' => $store->id, 'active' => true,
        ]);
        $roleId = DB::table('roles')->where('name', 'admin')->value('id')
            ?? DB::table('roles')->insertGetId([
                'name' => 'admin', 'guard_name' => 'api', 'created_at' => now(), 'updated_at' => now(),
            ]);
        DB::table('model_has_roles')->insert([
            'role_id' => $roleId, 'model_type' => User::class, 'model_id' => $this->admin->id,
        ]);

        $this->session = CashRegisterSession::create([
            'register_id' => $register->id,
            'user_id' => $this->admin->id,
            'opening_cash' => 0,
            'status' => CashRegisterSession::STATUS_CLOSED,
            'opened_at' => Carbon::parse('2026-11-03 17:00:00', 'UTC'),
            'closed_at' => Carbon::parse('2026-11-04 01:00:00', 'UTC'),
        ]);

        DB::table('cash_movements')->insert([
            'register_session_id' => $this->session->id,
            'type' => 'entrada',
            'amount' => 150,
            'description' => 'Ingreso de prueba',
            'created_at' => self::STORED_UTC,
        ]);

        $customer = Customer::create(['name' => 'Cliente Test', 'company_id' => $company->id]);
        $order = PreSaleOrder::create([
            'code' => 'PREV-TZ-001',
            'store_id' => $store->id,
            'user_id' => $this->admin->id,
            'customer_id' => $customer->id,
            'status' => PreSaleOrder::STATUS_PENDING,
        ]);
        $method = PaymentMethod::create(['name' => 'Efectivo', 'active' => true]);
        PreSaleOrderPayment::forceCreate([
            'pre_sale_order_id' => $order->id,
            'amount' => 80,
            'payment_method_id' => $method->id,
            'cashier_id' => $this->admin->id,
            'created_at' => self::STORED_UTC,
        ]);

        $supply = Supply::create([
            'company_id' => $company->id, 'name' => 'Cinta canela', 'category' => 'Empaque', 'unit' => 'rollo',
        ]);
        SupplyMovement::forceCreate([
            'supply_id' => $supply->id,
            'user_id' => $this->admin->id,
            'register_session_id' => $this->session->id,
            'type' => SupplyMovement::TYPE_PURCHASE,
            'quantity' => 1,
            'amount' => 45,
            'created_at' => self::STORED_UTC,
        ]);
    }

    /** @return array<string, array{0: string}> */
    public static function naiveTimestampFields(): array
    {
        return [
            'movimientos de caja' => ['data.movements.0.created_at'],
            'cobros de preventa' => ['data.pre_sale_payments.0.created_at'],
            'compras de insumos' => ['data.supply_purchases.0.created_at'],
        ];
    }

    #[DataProvider('naiveTimestampFields')]
    public function test_el_detalle_del_corte_manda_la_fecha_con_zona(string $path): void
    {
        $raw = $this->actingAs($this->admin)
            ->getJson("/api/v1/reports/cash/{$this->session->id}/detail")
            ->assertOk()
            ->json($path);

        $this->assertSame(self::EXPECTED_ISO, $raw);
        $this->assertSame(
            '13:23',
            Carbon::parse($raw)->setTimezone(DateRange::timezone())->format('H:i'),
        );
    }
}
