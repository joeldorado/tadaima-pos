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
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Insumos (Fase 2): la compra pagada con efectivo de la caja crea el
 * cash_movement 'salida' linkeado EN LA MISMA transacción, y el corte
 * (expected_cash) la refleja sin tocar la fórmula (se auto-balancea).
 */
class SupplyPurchaseCashLinkTest extends TestCase
{
    use RefreshDatabase;

    private User $cashier;
    private User $admin;
    private Store $store;
    private CashRegisterSession $session;
    private Supply $supply;

    protected function setUp(): void
    {
        parent::setUp();

        $company = Company::create(['name' => 'Test Co']);
        $this->store = Store::create(['company_id' => $company->id, 'name' => 'Test Store']);

        $this->cashier = User::create([
            'name' => 'Cajero', 'email' => 'cajero@test.com', 'password' => bcrypt('x'),
            'company_id' => $company->id, 'store_id' => $this->store->id,
        ]);
        $this->assignRole($this->cashier, 'cajero');

        $this->admin = User::create([
            'name' => 'Admin', 'email' => 'admin@test.com', 'password' => bcrypt('x'),
            'company_id' => $company->id, 'store_id' => $this->store->id,
        ]);
        $this->assignRole($this->admin, 'admin');

        $register = CashRegister::create(['store_id' => $this->store->id, 'name' => 'Caja 1', 'active' => true]);
        $this->session = CashRegisterSession::create([
            'register_id' => $register->id, 'user_id' => $this->cashier->id,
            'opening_cash' => 500, 'status' => 'open', 'opened_at' => now(),
        ]);

        $this->supply = Supply::create([
            'company_id' => $company->id, 'name' => 'Cinta canela', 'category' => 'Empaque', 'unit' => 'rollo',
        ]);
    }

    private function assignRole(User $user, string $role): void
    {
        $roleId = DB::table('roles')->where('name', $role)->value('id')
            ?? DB::table('roles')->insertGetId(['name' => $role, 'created_at' => now(), 'updated_at' => now()]);
        DB::table('model_has_roles')->insert([
            'role_id' => $roleId, 'model_type' => User::class, 'model_id' => $user->id,
        ]);
    }

    public function test_purchase_creates_linked_cash_salida_in_same_transaction(): void
    {
        $this->actingAs($this->cashier)
            ->postJson('/api/v1/supplies/movements', [
                'supply_id' => $this->supply->id,
                'quantity'  => 2,
                'amount'    => 80,
                'note'      => 'para envolver',
            ])
            ->assertStatus(201)
            ->assertJsonPath('data.type', 'purchase')
            ->assertJsonPath('data.amount', 80);

        $movement = SupplyMovement::first();
        $this->assertNotNull($movement->cash_movement_id);

        $cash = CashMovement::find($movement->cash_movement_id);
        $this->assertSame('salida', $cash->type);
        $this->assertSame(80.0, (float) $cash->amount);
        $this->assertSame($this->session->id, (int) $cash->register_session_id);
        $this->assertStringContainsString('Insumo: Cinta canela', $cash->description);
        $this->assertSame($this->session->id, (int) $movement->register_session_id);
        $this->assertSame($this->cashier->id, (int) $movement->user_id);
    }

    public function test_purchase_without_open_session_rejected_and_atomic(): void
    {
        $this->session->update(['status' => 'closed', 'closed_at' => now()]);

        $this->actingAs($this->cashier)
            ->postJson('/api/v1/supplies/movements', [
                'supply_id' => $this->supply->id,
                'quantity'  => 1,
                'amount'    => 50,
            ])
            ->assertStatus(422);

        // Atómico: no quedó ni el movimiento ni una salida huérfana.
        $this->assertSame(0, SupplyMovement::count());
        $this->assertSame(0, CashMovement::count());
    }

    public function test_expected_cash_reflects_supply_purchase(): void
    {
        // Apertura $500 − compra $80 → expected_cash $420 (la salida linkeada
        // ya entra en total_salidas; el corte se auto-balancea).
        $this->actingAs($this->cashier)->postJson('/api/v1/supplies/movements', [
            'supply_id' => $this->supply->id, 'quantity' => 1, 'amount' => 80,
        ])->assertStatus(201);

        $resp = $this->actingAs($this->admin)
            ->getJson('/api/v1/reports/cash?from=' . now()->subDay()->toDateString() . '&to=' . now()->addDay()->toDateString())
            ->assertStatus(200);

        $row = collect($resp->json('data.sessions'))->firstWhere('id', $this->session->id);
        $this->assertNotNull($row);
        $this->assertSame(80.0, (float) $row['total_salidas']);
        $this->assertSame(80.0, (float) $row['total_supplies']);
        $this->assertSame(1, (int) $row['supplies_count']);
        $this->assertSame(420.0, (float) $row['expected_cash']);
    }

    public function test_cash_detail_includes_supply_purchases(): void
    {
        $this->actingAs($this->cashier)->postJson('/api/v1/supplies/movements', [
            'supply_id' => $this->supply->id, 'quantity' => 3, 'amount' => 45, 'note' => 'bolsas chicas',
        ])->assertStatus(201);

        $this->actingAs($this->admin)
            ->getJson("/api/v1/reports/cash/{$this->session->id}/detail")
            ->assertStatus(200)
            ->assertJsonPath('data.supply_purchases.0.name', 'Cinta canela')
            ->assertJsonPath('data.supply_purchases.0.amount', 45)
            ->assertJsonPath('data.supply_purchases.0.quantity', 3);
    }

    public function test_consumption_does_not_touch_cash(): void
    {
        $this->actingAs($this->cashier)
            ->postJson('/api/v1/supplies/movements', [
                'supply_id' => $this->supply->id,
                'type'      => 'consumption',
                'quantity'  => 1,
            ])
            ->assertStatus(201);

        $this->assertSame(1, SupplyMovement::count());
        $this->assertSame(0, CashMovement::count());
        $this->assertNull(SupplyMovement::first()->cash_movement_id);
    }

    public function test_catalog_crud_gated_to_admin_or_manager(): void
    {
        // Cajero NO puede crear insumos en el catálogo…
        $this->actingAs($this->cashier)
            ->postJson('/api/v1/supplies', ['name' => 'Bolsas', 'category' => 'Empaque'])
            ->assertStatus(403);

        // …pero admin sí, y el cajero sí puede LISTAR (para registrar compras).
        $this->actingAs($this->admin)
            ->postJson('/api/v1/supplies', ['name' => 'Bolsas', 'category' => 'Empaque'])
            ->assertStatus(201);

        $this->actingAs($this->cashier)
            ->getJson('/api/v1/supplies')
            ->assertStatus(200)
            ->assertJsonCount(2, 'data');
    }

    public function test_purchase_requires_positive_amount(): void
    {
        $this->actingAs($this->cashier)
            ->postJson('/api/v1/supplies/movements', [
                'supply_id' => $this->supply->id, 'quantity' => 1, 'amount' => 0,
            ])
            ->assertStatus(422);
    }
}
