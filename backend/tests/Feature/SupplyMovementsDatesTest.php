<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Store;
use App\Models\Supply;
use App\Models\SupplyMovement;
use App\Models\User;
use App\Support\DateRange;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * `GET /supplies/movements?dates=a,b,c` — fechas sueltas para los egresos del
 * Reporte de Ventas (2026-10-19). Antes los egresos usaban el rango del primer
 * al último día elegido y metían los gastos de los días de en medio.
 */
class SupplyMovementsDatesTest extends TestCase
{
    use RefreshDatabase;

    private Store $store;
    private User $admin;
    private Supply $cinta;

    protected function setUp(): void
    {
        parent::setUp();

        $company = Company::create(['name' => 'Tadaima Test']);
        $this->store = Store::create([
            'company_id' => $company->id,
            'name' => 'Tienda Test',
            'active' => true,
        ]);
        $this->admin = User::create([
            'name' => 'Admin',
            'email' => 'admin@test.com',
            'password' => bcrypt('password'),
            'company_id' => $company->id,
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

        $this->cinta = Supply::create([
            'company_id' => $company->id,
            'name' => 'Cinta',
            'category' => 'Empaque',
        ]);
    }

    /** Compra registrada a mediodía (hora del negocio) de `$localDate`, lejos de los bordes del día. */
    private function purchaseOn(string $localDate, float $amount): SupplyMovement
    {
        $movement = new SupplyMovement([
            'supply_id' => $this->cinta->id,
            'store_id' => $this->store->id,
            'type' => SupplyMovement::TYPE_PURCHASE,
            'quantity' => 1,
            'amount' => $amount,
            'money_source' => 'caja_chica',
            'user_id' => $this->admin->id,
        ]);
        $movement->created_at = DateRange::fromUtc($localDate)?->addHours(12);
        $movement->save();

        return $movement;
    }

    /** @return int[] */
    private function movementIds(string $query): array
    {
        $res = $this->actingAs($this->admin)
            ->getJson('/api/v1/supplies/movements?' . $query)
            ->assertOk();

        return collect($res->json('data'))->pluck('id')->sort()->values()->all();
    }

    public function test_dates_sueltas_dejan_fuera_el_egreso_de_un_dia_intermedio(): void
    {
        $primero = $this->purchaseOn('2026-10-01', 80);
        $this->purchaseOn('2026-10-03', 45); // día de en medio, NO elegido
        $ultimo = $this->purchaseOn('2026-10-05', 30);

        $this->assertSame(
            [$primero->id, $ultimo->id],
            $this->movementIds('dates=2026-10-01,2026-10-05&store_id=' . $this->store->id),
        );
    }

    public function test_sin_dates_sigue_usando_from_to_como_antes(): void
    {
        $primero = $this->purchaseOn('2026-10-01', 80);
        $medio = $this->purchaseOn('2026-10-03', 45);
        $ultimo = $this->purchaseOn('2026-10-05', 30);
        $this->purchaseOn('2026-10-09', 10); // fuera del rango

        $this->assertSame(
            [$primero->id, $medio->id, $ultimo->id],
            $this->movementIds('from=2026-10-01&to=2026-10-05'),
        );
    }

    /** Igual que en ventas: fechas que no se pueden leer no quitan el filtro. */
    public function test_dates_invalidas_no_traen_todos_los_egresos(): void
    {
        $this->purchaseOn('2026-10-01', 80);

        $this->assertSame([], $this->movementIds('dates=no-es-fecha,2026-13-45'));
    }
}
