<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\CashRegister;
use App\Models\CashRegisterSession;
use App\Models\Company;
use App\Models\Store;
use App\Models\Supply;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Reporte de insumos por rango: gasto agrupado por categoría + top insumos.
 */
class SupplyReportRangeTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private Supply $cinta;
    private Supply $bolsas;
    private Supply $limpiador;

    protected function setUp(): void
    {
        parent::setUp();

        $company = Company::create(['name' => 'Test Co']);
        $store = Store::create(['company_id' => $company->id, 'name' => 'Test Store']);
        $this->admin = User::create([
            'name' => 'Admin', 'email' => 'admin@test.com', 'password' => bcrypt('x'),
            'company_id' => $company->id, 'store_id' => $store->id,
        ]);
        $roleId = DB::table('roles')->insertGetId(['name' => 'admin', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('model_has_roles')->insert(['role_id' => $roleId, 'model_type' => User::class, 'model_id' => $this->admin->id]);

        $register = CashRegister::create(['store_id' => $store->id, 'name' => 'Caja 1', 'active' => true]);
        CashRegisterSession::create([
            'register_id' => $register->id, 'user_id' => $this->admin->id,
            'opening_cash' => 0, 'status' => 'open', 'opened_at' => now(),
        ]);

        $this->cinta     = Supply::create(['company_id' => $company->id, 'name' => 'Cinta', 'category' => 'Empaque']);
        $this->bolsas    = Supply::create(['company_id' => $company->id, 'name' => 'Bolsas', 'category' => 'Empaque']);
        $this->limpiador = Supply::create(['company_id' => $company->id, 'name' => 'Limpiador', 'category' => 'Limpieza']);
    }

    private function buy(Supply $supply, float $amount): void
    {
        $this->actingAs($this->admin)->postJson('/api/v1/supplies/movements', [
            'supply_id' => $supply->id, 'quantity' => 1, 'amount' => $amount,
        ])->assertStatus(201);
    }

    public function test_report_groups_by_category_and_ranks_top_supplies(): void
    {
        $this->buy($this->cinta, 80);
        $this->buy($this->bolsas, 45);
        $this->buy($this->limpiador, 30);

        $resp = $this->actingAs($this->admin)
            ->getJson('/api/v1/reports/supplies?from=' . now()->subDay()->toDateString() . '&to=' . now()->addDay()->toDateString())
            ->assertStatus(200);

        $this->assertSame(155.0, (float) $resp->json('data.total'));

        $categories = collect($resp->json('data.by_category'));
        $empaque = $categories->firstWhere('category', 'Empaque');
        $this->assertSame(125.0, (float) $empaque['total']);
        $this->assertSame(2, (int) $empaque['purchases']);
        // Ordenado por gasto desc: Empaque (125) antes que Limpieza (30).
        $this->assertSame('Empaque', $categories->first()['category']);

        $top = collect($resp->json('data.top_supplies'));
        $this->assertSame('Cinta', $top->first()['name']);
        $this->assertSame(80.0, (float) $top->first()['total']);
    }

    public function test_report_respects_date_range(): void
    {
        $this->buy($this->cinta, 80);

        // Rango en el pasado → sin compras.
        $resp = $this->actingAs($this->admin)
            ->getJson('/api/v1/reports/supplies?from=2026-01-01&to=2026-01-31')
            ->assertStatus(200);

        $this->assertSame(0.0, (float) $resp->json('data.total'));
        $this->assertSame([], $resp->json('data.by_category'));
    }
}
