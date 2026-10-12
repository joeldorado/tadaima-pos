<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\CashMovement;
use App\Models\CashRegister;
use App\Models\CashRegisterSession;
use App\Models\Company;
use App\Models\Store;
use App\Models\Supply;
use App\Models\SupplyMovement;
use App\Models\SystemLog;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * DELETE /supplies/movements/{movement} (2026-10-12, Joel): limpieza de
 * registros de prueba en producción. Solo admin. Si el movimiento tenía
 * `cash_movement_id` (origen 'caja'), también borra ESE cash_movement —
 * sin eso el cajón quedaría descuadrado (el "esperado" seguiría restando
 * un efectivo que, según el insumo borrado, nunca salió).
 */
class SupplyMovementDeleteTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;
    private Store $store;
    private User $cashier;
    private User $admin;
    private CashRegisterSession $session;
    private Supply $supply;

    protected function setUp(): void
    {
        parent::setUp();

        $this->company = Company::create(['name' => 'Test Co']);
        $this->store = Store::create(['company_id' => $this->company->id, 'name' => 'Centro']);

        $this->cashier = User::create([
            'name' => 'Cajero', 'email' => 'cajero@test.com', 'password' => bcrypt('x'),
            'company_id' => $this->company->id, 'store_id' => $this->store->id,
        ]);
        $this->assignRole($this->cashier, 'cajero');

        $this->admin = User::create([
            'name' => 'Admin', 'email' => 'admin@test.com', 'password' => bcrypt('x'),
            'company_id' => $this->company->id, 'store_id' => $this->store->id,
        ]);
        $this->assignRole($this->admin, 'admin');

        $register = CashRegister::create(['store_id' => $this->store->id, 'name' => 'Caja 1', 'active' => true]);
        $this->session = CashRegisterSession::create([
            'register_id' => $register->id, 'user_id' => $this->cashier->id,
            'opening_cash' => 500, 'status' => 'open', 'opened_at' => now(),
        ]);

        $this->supply = Supply::create(['company_id' => $this->company->id, 'name' => 'Compra de Cambio']);
    }

    private function assignRole(User $user, string $role): void
    {
        $roleId = DB::table('roles')->where('name', $role)->value('id')
            ?? DB::table('roles')->insertGetId(['name' => $role, 'guard_name' => 'api', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('model_has_roles')->insert(['role_id' => $roleId, 'model_type' => User::class, 'model_id' => $user->id]);
    }

    public function test_cajero_no_puede_borrar_un_insumo(): void
    {
        $this->actingAs($this->cashier)->postJson('/api/v1/supplies/movements', [
            'supply_id' => $this->supply->id, 'quantity' => 1, 'amount' => 20,
        ])->assertStatus(201);
        $movement = SupplyMovement::sole();

        $this->actingAs($this->cashier)
            ->deleteJson("/api/v1/supplies/movements/{$movement->id}")
            ->assertStatus(403);

        $this->assertSame(1, SupplyMovement::count());
    }

    public function test_admin_borra_un_insumo_de_caja_chica_sin_tocar_caja(): void
    {
        $this->actingAs($this->cashier)->postJson('/api/v1/supplies/movements', [
            'supply_id' => $this->supply->id, 'quantity' => 1, 'amount' => 20, 'money_source' => 'caja_chica',
        ])->assertStatus(201);
        $movement = SupplyMovement::sole();
        $this->assertNull($movement->cash_movement_id);

        $this->actingAs($this->admin)
            ->deleteJson("/api/v1/supplies/movements/{$movement->id}")
            ->assertOk();

        $this->assertSame(0, SupplyMovement::count());
    }

    public function test_admin_borra_un_insumo_de_caja_y_regresa_el_esperado_a_como_si_nunca_hubiera_pasado(): void
    {
        // Apertura $500 − compra $80 → expected_cash $420.
        $this->actingAs($this->cashier)->postJson('/api/v1/supplies/movements', [
            'supply_id' => $this->supply->id, 'quantity' => 1, 'amount' => 80,
        ])->assertStatus(201);
        $movement = SupplyMovement::sole();
        $this->assertNotNull($movement->cash_movement_id, 'Origen caja debe crear el cash_movement linkeado');
        $this->assertSame(1, CashMovement::count());

        $this->actingAs($this->admin)
            ->deleteJson("/api/v1/supplies/movements/{$movement->id}")
            ->assertOk();

        $this->assertSame(0, SupplyMovement::count());
        $this->assertSame(0, CashMovement::count(), 'El cash_movement linkeado debe borrarse junto con el insumo');

        $resp = $this->actingAs($this->admin)
            ->getJson('/api/v1/reports/cash?from=' . now()->subDay()->toDateString() . '&to=' . now()->addDay()->toDateString())
            ->assertStatus(200);
        $row = collect($resp->json('data.sessions'))->firstWhere('id', $this->session->id);
        $this->assertSame(500.0, (float) $row['expected_cash'], 'Sin la compra, el esperado regresa a la apertura');
    }

    public function test_borrar_deja_snapshot_en_system_logs(): void
    {
        $this->actingAs($this->cashier)->postJson('/api/v1/supplies/movements', [
            'supply_id' => $this->supply->id, 'quantity' => 1, 'amount' => 20, 'note' => 'test',
        ])->assertStatus(201);
        $movement = SupplyMovement::sole();

        $this->actingAs($this->admin)
            ->deleteJson("/api/v1/supplies/movements/{$movement->id}")
            ->assertOk();

        $log = SystemLog::where('action', 'supply_movement.deleted')->first();
        $this->assertNotNull($log);
        $this->assertSame($this->admin->id, $log->user_id);
        $this->assertSame((float) 20, (float) $log->meta['amount']);
        $this->assertSame('Compra de Cambio', $log->meta['supply_name']);
    }

    public function test_no_puede_borrar_insumo_de_otra_empresa(): void
    {
        $otraEmpresa = Company::create(['name' => 'Otra']);
        $otroSupply = Supply::create(['company_id' => $otraEmpresa->id, 'name' => 'Ajeno']);
        $movement = SupplyMovement::create([
            'supply_id' => $otroSupply->id, 'type' => 'purchase', 'quantity' => 1, 'amount' => 50, 'user_id' => $this->admin->id,
        ]);

        $this->actingAs($this->admin)
            ->deleteJson("/api/v1/supplies/movements/{$movement->id}")
            ->assertStatus(403);

        $this->assertSame(1, SupplyMovement::count());
    }
}
