<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Sale;
use App\Models\Store;
use App\Models\User;
use App\Support\DateRange;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * `GET /reports/sales?dates[]=...` — fechas sueltas (no consecutivas),
 * aditivo a from/to (pestaña Ventas de Reportes, 2026-10-19).
 */
class ReportsSalesDatesTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;
    private Store $store;
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

    private function saleOn(string $localDate, float $total): Sale
    {
        // 'sold_at' no está en $fillable (Sale::booted lo setea a now() si
        // viene null) — hay que asignarlo como atributo directo, no por
        // mass-assignment en create().
        $sale = new Sale([
            'store_id'  => $this->store->id,
            'user_id'   => $this->admin->id,
            'subtotal'  => $total,
            'discount'  => 0,
            'total'     => $total,
            'status'    => Sale::STATUS_COMPLETED,
        ]);
        $sale->sold_at = DateRange::fromUtc($localDate)?->addHours(12); // mediodía local, lejos de los bordes del día
        $sale->save();

        return $sale;
    }

    public function test_dates_sueltas_solo_trae_los_dias_elegidos(): void
    {
        $this->saleOn('2026-10-01', 100);
        $this->saleOn('2026-10-02', 200); // NO elegido — debe quedar fuera
        $this->saleOn('2026-10-05', 300);
        $this->saleOn('2026-10-10', 400);

        $res = $this->actingAs($this->admin)
            ->getJson('/api/v1/reports/sales?dates=2026-10-01,2026-10-05,2026-10-10')
            ->assertOk();

        $this->assertSame(3, $res->json('data.summary.total_count'));
        $this->assertEquals(800, $res->json('data.summary.total_revenue'));
    }

    /**
     * Fechas que no se pueden leer no deben quitar el filtro: antes, si ninguna
     * servía, el OR quedaba vacío y el reporte traía TODAS las ventas.
     */
    public function test_dates_invalidas_no_traen_todas_las_ventas(): void
    {
        $this->saleOn('2026-10-01', 100);
        $this->saleOn('2026-10-05', 300);

        $res = $this->actingAs($this->admin)
            ->getJson('/api/v1/reports/sales?dates=no-es-fecha,2026-13-45')
            ->assertOk();

        $this->assertSame(0, $res->json('data.summary.total_count'));

        $this->actingAs($this->admin)
            ->getJson('/api/v1/sales?dates=no-es-fecha&whole_store=1')
            ->assertOk()
            ->assertJsonCount(0, 'data.data');
    }

    public function test_sin_dates_sigue_usando_from_to_como_antes(): void
    {
        $this->saleOn('2026-10-01', 100);
        $this->saleOn('2026-10-15', 500); // fuera del rango from/to

        $res = $this->actingAs($this->admin)
            ->getJson('/api/v1/reports/sales?from=2026-10-01&to=2026-10-01')
            ->assertOk();

        $this->assertSame(1, $res->json('data.summary.total_count'));
        $this->assertEquals(100, $res->json('data.summary.total_revenue'));
    }
}
