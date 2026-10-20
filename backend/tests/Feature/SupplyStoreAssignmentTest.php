<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\CashRegister;
use App\Models\CashRegisterSession;
use App\Models\Company;
use App\Models\Store;
use App\Models\Supply;
use App\Models\SupplyMovement;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Tienda del insumo (2026-10-12, Joel): un gerente sin store_id asignado
 * creaba insumos "de toda la empresa" sin querer (cuenta mal configurada),
 * y esos insumos luego no le aparecían en su propio reporte de corte (el
 * filtro por tienda del cajero/gerente nunca matchea NULL). Ahora:
 *   - gerente SIEMPRE queda forzado a su tienda; sin tienda asignada → 422.
 *   - admin sigue pudiendo dejar "toda la empresa" (null) a propósito.
 *   - editar (PUT) ahora SÍ permite reasignar la tienda (antes se ignoraba
 *     en silencio aunque el selector del modal lo dejara elegir).
 */
class SupplyStoreAssignmentTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;
    private Store $storeA;
    private Store $storeB;
    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->company = Company::create(['name' => 'Tadaima Test']);
        $this->storeA = Store::create(['company_id' => $this->company->id, 'name' => 'Centro']);
        $this->storeB = Store::create(['company_id' => $this->company->id, 'name' => 'Norte']);
        $this->admin = $this->makeUser('admin', $this->storeA->id);
    }

    private function makeUser(string $role, ?int $storeId): User
    {
        $user = User::create([
            'name' => ucfirst($role) . ' Test', 'email' => $role . uniqid() . '@test.com',
            'password' => bcrypt('x'), 'company_id' => $this->company->id, 'store_id' => $storeId, 'active' => true,
        ]);
        $roleId = DB::table('roles')->where('name', $role)->value('id')
            ?? DB::table('roles')->insertGetId(['name' => $role, 'guard_name' => 'api', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('model_has_roles')->insert(['role_id' => $roleId, 'model_type' => User::class, 'model_id' => $user->id]);

        return $user;
    }

    public function test_gerente_sin_tienda_asignada_no_puede_crear_insumo(): void
    {
        $gerenteSinTienda = $this->makeUser('gerente', null);

        $this->actingAs($gerenteSinTienda)
            ->postJson('/api/v1/supplies', ['name' => 'Cinta canela'])
            ->assertStatus(422);

        $this->assertSame(0, Supply::count());
    }

    public function test_gerente_con_tienda_queda_forzado_a_la_suya(): void
    {
        $gerente = $this->makeUser('gerente', $this->storeA->id);

        // Aunque el gerente mandara otra tienda en el body, queda forzado a la suya.
        $resp = $this->actingAs($gerente)
            ->postJson('/api/v1/supplies', ['name' => 'Cinta canela', 'store_id' => $this->storeB->id])
            ->assertStatus(201);

        $this->assertSame($this->storeA->id, $resp->json('data.store_id'));
    }

    public function test_admin_puede_crear_insumo_de_toda_la_empresa(): void
    {
        $resp = $this->actingAs($this->admin)
            ->postJson('/api/v1/supplies', ['name' => 'Papelería general'])
            ->assertStatus(201);

        $this->assertNull($resp->json('data.store_id'));
    }

    public function test_admin_puede_reasignar_la_tienda_de_un_insumo_existente(): void
    {
        $supply = Supply::create(['company_id' => $this->company->id, 'name' => 'Sueldos', 'store_id' => null]);

        $resp = $this->actingAs($this->admin)
            ->putJson("/api/v1/supplies/{$supply->id}", ['name' => 'Sueldos', 'store_id' => $this->storeA->id])
            ->assertOk();

        $this->assertSame($this->storeA->id, $resp->json('data.store_id'));
        $this->assertSame($this->storeA->id, $supply->fresh()->store_id);
    }

    public function test_admin_puede_regresar_un_insumo_a_toda_la_empresa(): void
    {
        $supply = Supply::create(['company_id' => $this->company->id, 'name' => 'Sueldos', 'store_id' => $this->storeA->id]);

        $resp = $this->actingAs($this->admin)
            ->putJson("/api/v1/supplies/{$supply->id}", ['name' => 'Sueldos', 'store_id' => null])
            ->assertOk();

        $this->assertNull($resp->json('data.store_id'));
    }

    public function test_gerente_no_puede_mover_un_insumo_a_otra_tienda(): void
    {
        $gerente = $this->makeUser('gerente', $this->storeA->id);
        $supply = Supply::create(['company_id' => $this->company->id, 'name' => 'Cinta', 'store_id' => $this->storeA->id]);

        $this->actingAs($gerente)
            ->putJson("/api/v1/supplies/{$supply->id}", ['name' => 'Cinta', 'store_id' => $this->storeB->id])
            ->assertOk();

        // El gerente puede editar nombre/categoría, pero store_id se ignora para él.
        $this->assertSame($this->storeA->id, $supply->fresh()->store_id);
    }

    private function openSession(User $user, int $storeId): void
    {
        $register = CashRegister::create(['store_id' => $storeId, 'name' => "Caja {$user->name}", 'active' => true]);
        CashRegisterSession::create([
            'register_id' => $register->id, 'user_id' => $user->id,
            'opening_cash' => 500, 'status' => 'open', 'opened_at' => now(),
        ]);
    }

    public function test_cajero_sin_tienda_no_puede_registrar_compra(): void
    {
        $cajeroSinTienda = $this->makeUser('cajero', null);
        $supply = Supply::create(['company_id' => $this->company->id, 'name' => 'Sueldos', 'store_id' => null]);

        $this->actingAs($cajeroSinTienda)
            ->postJson('/api/v1/supplies/movements', ['supply_id' => $supply->id, 'quantity' => 1, 'amount' => 300])
            ->assertStatus(422);

        $this->assertSame(0, SupplyMovement::count());
    }

    public function test_compra_contra_categoria_de_toda_la_empresa_queda_atada_a_la_tienda_de_quien_la_registra(): void
    {
        // La categoría ("Sueldos") es de TODA LA EMPRESA (store_id null) — lo
        // típico cuando un admin la da de alta sin pensar en una tienda.
        $supply = Supply::create(['company_id' => $this->company->id, 'name' => 'Sueldos', 'store_id' => null]);
        $cajeroCentro = $this->makeUser('cajero', $this->storeA->id);
        $this->openSession($cajeroCentro, $this->storeA->id);

        $this->actingAs($cajeroCentro)
            ->postJson('/api/v1/supplies/movements', ['supply_id' => $supply->id, 'quantity' => 1, 'amount' => 300])
            ->assertStatus(201);

        // El MOVIMIENTO (no la categoría) queda atado a Centro, aunque la
        // categoría siga siendo "toda la empresa".
        $movement = SupplyMovement::sole();
        $this->assertSame($this->storeA->id, $movement->store_id);
        $this->assertNull($supply->fresh()->store_id);
    }

    public function test_reporte_de_toda_la_tienda_encuentra_el_movimiento_aunque_la_categoria_sea_de_toda_la_empresa(): void
    {
        // Este es EXACTO el bug reportado: "Sueldos" es de toda la empresa,
        // el cajero de Centro lo registra, y su reporte "whole_store" (el que
        // descarga desde Cerrar Caja) antes no lo encontraba.
        $supply = Supply::create(['company_id' => $this->company->id, 'name' => 'Sueldos', 'store_id' => null]);
        $cajeroCentro = $this->makeUser('cajero', $this->storeA->id);
        $this->openSession($cajeroCentro, $this->storeA->id);
        $this->actingAs($cajeroCentro)
            ->postJson('/api/v1/supplies/movements', ['supply_id' => $supply->id, 'quantity' => 1, 'amount' => 300])
            ->assertStatus(201);

        $resp = $this->actingAs($cajeroCentro)
            ->getJson('/api/v1/supplies/movements?whole_store=1')
            ->assertOk();

        $amounts = array_map('floatval', array_column($resp->json('data'), 'amount'));
        $this->assertContains(300.0, $amounts, 'El reporte de toda la tienda debe encontrar el movimiento');
    }

    public function test_admin_puede_elegir_tienda_al_registrar_una_compra(): void
    {
        // caja_chica no exige sesión abierta — aísla lo que se prueba aquí.
        $supply = Supply::create(['company_id' => $this->company->id, 'name' => 'Sueldos', 'store_id' => null]);

        $resp = $this->actingAs($this->admin)
            ->postJson('/api/v1/supplies/movements', [
                'supply_id' => $supply->id, 'quantity' => 1, 'amount' => 300,
                'money_source' => 'caja_chica', 'store_id' => $this->storeB->id,
            ])
            ->assertStatus(201);

        $this->assertSame($this->storeB->id, $resp->json('data.store_id'));
    }

    public function test_admin_sin_elegir_tienda_usa_la_suya_si_tiene(): void
    {
        $supply = Supply::create(['company_id' => $this->company->id, 'name' => 'Sueldos', 'store_id' => null]);

        // $this->admin tiene store_id = storeA (ver setUp).
        $resp = $this->actingAs($this->admin)
            ->postJson('/api/v1/supplies/movements', [
                'supply_id' => $supply->id, 'quantity' => 1, 'amount' => 300, 'money_source' => 'caja_chica',
            ])
            ->assertStatus(201);

        $this->assertSame($this->storeA->id, $resp->json('data.store_id'));
    }

    public function test_admin_sin_tienda_propia_y_sin_elegir_cae_a_toda_la_empresa(): void
    {
        $adminSinTienda = $this->makeUser('admin', null);
        $supply = Supply::create(['company_id' => $this->company->id, 'name' => 'Sueldos', 'store_id' => null]);

        $resp = $this->actingAs($adminSinTienda)
            ->postJson('/api/v1/supplies/movements', [
                'supply_id' => $supply->id, 'quantity' => 1, 'amount' => 300, 'money_source' => 'caja_chica',
            ])
            ->assertStatus(201);

        $this->assertNull($resp->json('data.store_id'));
    }

    public function test_cajero_no_puede_elegir_tienda_al_registrar_aunque_la_mande(): void
    {
        $supply = Supply::create(['company_id' => $this->company->id, 'name' => 'Sueldos', 'store_id' => null]);
        $cajeroCentro = $this->makeUser('cajero', $this->storeA->id);

        $resp = $this->actingAs($cajeroCentro)
            ->postJson('/api/v1/supplies/movements', [
                'supply_id' => $supply->id, 'quantity' => 1, 'amount' => 300,
                'money_source' => 'caja_chica', 'store_id' => $this->storeB->id,
            ])
            ->assertStatus(201);

        // Mandó storeB en el body, pero queda forzado a la suya (storeA).
        $this->assertSame($this->storeA->id, $resp->json('data.store_id'));
    }

    public function test_movimientos_viejos_sin_store_id_propio_se_resuelven_por_la_tienda_de_la_categoria(): void
    {
        // Simula un registro de ANTES de esta migración: supply_movements.store_id
        // NULL, pero la CATEGORÍA sí tenía tienda — debe seguir encontrándose
        // igual que antes (no romper el historial).
        $supply = Supply::create(['company_id' => $this->company->id, 'name' => 'Cinta', 'store_id' => $this->storeA->id]);
        $cajeroCentro = $this->makeUser('cajero', $this->storeA->id);
        DB::table('supply_movements')->insert([
            'supply_id' => $supply->id, 'store_id' => null, 'type' => 'purchase',
            'quantity' => 1, 'amount' => 75, 'user_id' => $cajeroCentro->id, 'created_at' => now(),
        ]);

        $resp = $this->actingAs($cajeroCentro)
            ->getJson('/api/v1/supplies/movements?whole_store=1')
            ->assertOk();

        $amounts = array_map('floatval', array_column($resp->json('data'), 'amount'));
        $this->assertContains(75.0, $amounts);
    }
}
