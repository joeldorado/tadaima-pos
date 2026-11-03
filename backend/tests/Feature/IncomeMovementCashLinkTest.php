<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\CashMovement;
use App\Models\CashRegister;
use App\Models\CashRegisterSession;
use App\Models\Company;
use App\Models\IncomeMovement;
use App\Models\Store;
use App\Models\User;
use App\Services\IncomeService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class IncomeMovementCashLinkTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;
    private Store $storeA;
    private User $cashier;
    private User $manager;
    private User $admin;
    private CashRegisterSession $session;
    private CashRegisterSession $adminSession;

    protected function setUp(): void
    {
        parent::setUp();

        // Setup company
        $this->company = Company::create(['name' => 'Test Co']);

        // Setup stores
        $this->storeA = Store::create(['company_id' => $this->company->id, 'name' => 'Tienda A']);
        $storeB = Store::create(['company_id' => $this->company->id, 'name' => 'Tienda B']);

        // Setup users
        $this->admin = User::create([
            'name' => 'Admin', 'email' => 'admin@test.com', 'password' => bcrypt('x'),
            'company_id' => $this->company->id, 'store_id' => $this->storeA->id,
        ]);
        $this->assignRole($this->admin, 'admin');

        $this->manager = User::create([
            'name' => 'Manager', 'email' => 'manager@test.com', 'password' => bcrypt('x'),
            'company_id' => $this->company->id, 'store_id' => $this->storeA->id,
        ]);
        $this->assignRole($this->manager, 'gerente');

        $this->cashier = User::create([
            'name' => 'Cashier', 'email' => 'cashier@test.com', 'password' => bcrypt('x'),
            'company_id' => $this->company->id, 'store_id' => $this->storeA->id,
        ]);
        $this->assignRole($this->cashier, 'cajero');

        // Open cash session for cashier
        $register = CashRegister::create(['store_id' => $this->storeA->id, 'name' => 'Caja 1']);
        $this->session = CashRegisterSession::create([
            'register_id' => $register->id,
            'user_id' => $this->cashier->id,
            'opening_cash' => 500,
            'status' => 'open',
            'opened_at' => now(),
        ]);

        // Open cash session for admin (for testing store selection)
        $registerAdmin = CashRegister::create(['store_id' => $this->storeA->id, 'name' => 'Caja Admin']);
        $this->adminSession = CashRegisterSession::create([
            'register_id' => $registerAdmin->id,
            'user_id' => $this->admin->id,
            'opening_cash' => 1000,
            'status' => 'open',
            'opened_at' => now(),
        ]);
    }

    private function assignRole(User $user, string $role): void
    {
        $roleId = \DB::table('roles')->where('name', $role)->value('id')
            ?? \DB::table('roles')->insertGetId([
                'name' => $role,
                'guard_name' => 'api',
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        \DB::table('model_has_roles')->insert([
            'role_id' => $roleId,
            'model_type' => User::class,
            'model_id' => $user->id,
        ]);
    }

    // ─────────────────────────────────────────────────────────────────────────

    public function test_register_income_creates_linked_cash_entrada_atomically(): void
    {
        $resp = $this->actingAs($this->cashier)
            ->postJson('/api/v1/income-movements', [
                'type' => 'equipment_sale',
                'amount' => 500.50,
                'description' => 'Teléfono viejo Samsung',
            ])
            ->assertStatus(201);

        $this->assertSame(1, IncomeMovement::count());
        $this->assertSame(1, CashMovement::count());

        $movement = IncomeMovement::first();
        $this->assertSame('equipment_sale', $movement->type);
        $this->assertSame(500.50, (float) $movement->amount);
        $this->assertSame('Teléfono viejo Samsung', $movement->description);
        $this->assertSame($this->cashier->id, $movement->user_id);
        $this->assertNotNull($movement->cash_movement_id);

        $cashMovement = CashMovement::find($movement->cash_movement_id);
        $this->assertSame('entrada', $cashMovement->type);
        $this->assertSame(500.50, (float) $cashMovement->amount);
        $this->assertStringContainsString('Ingreso: equipment_sale', $cashMovement->description);
        $this->assertSame($this->session->id, $cashMovement->register_session_id);
    }

    public function test_income_without_open_session_rejected_and_atomic(): void
    {
        $this->session->update(['status' => 'closed', 'closed_at' => now()]);

        $resp = $this->actingAs($this->cashier)
            ->postJson('/api/v1/income-movements', [
                'type' => 'service_fee',
                'amount' => 100,
            ])
            ->assertStatus(422)
            ->assertJsonPath('error', 'Necesitas una caja abierta para registrar un ingreso (el efectivo entra a tu caja).');

        $this->assertSame(0, IncomeMovement::count());
        $this->assertSame(0, CashMovement::count());
    }

    public function test_income_validates_type_and_amount(): void
    {
        $this->actingAs($this->cashier)
            ->postJson('/api/v1/income-movements', [
                'type' => 'invalid_type',
                'amount' => 100,
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['type']);

        $this->actingAs($this->cashier)
            ->postJson('/api/v1/income-movements', [
                'type' => 'service_fee',
                'amount' => -50,
            ])
            ->assertStatus(422)
            ->assertJsonValidationErrors(['amount']);

        $this->assertSame(0, IncomeMovement::count());
    }

    public function test_admin_can_choose_store_for_income(): void
    {
        $storeB = Store::create(['company_id' => $this->company->id, 'name' => 'Tienda B']);

        $resp = $this->actingAs($this->admin)
            ->postJson('/api/v1/income-movements', [
                'type' => 'vendor_refund',
                'amount' => 250,
                'store_id' => $storeB->id,
            ])
            ->assertStatus(201);

        $movement = IncomeMovement::first();
        $this->assertSame($storeB->id, $movement->store_id);
    }

    public function test_cashier_forced_to_their_store(): void
    {
        $storeB = Store::create(['company_id' => $this->company->id, 'name' => 'Tienda B']);

        $resp = $this->actingAs($this->cashier)
            ->postJson('/api/v1/income-movements', [
                'type' => 'service_fee',
                'amount' => 100,
                'store_id' => $storeB->id,  // Ignored, forced to storeA
            ])
            ->assertStatus(201);

        $movement = IncomeMovement::first();
        $this->assertSame($this->storeA->id, $movement->store_id);
    }

    public function test_cashier_without_store_rejected(): void
    {
        $cashierNoStore = User::create([
            'name' => 'Cashier NoStore', 'email' => 'cashier.nostore@test.com', 'password' => bcrypt('x'),
            'company_id' => $this->company->id, 'store_id' => null,
        ]);
        $this->assignRole($cashierNoStore, 'cajero');

        $this->actingAs($cashierNoStore)
            ->postJson('/api/v1/income-movements', [
                'type' => 'service_fee',
                'amount' => 100,
            ])
            ->assertStatus(422)
            ->assertJsonPath('error', 'Tu usuario no tiene una tienda asignada — pídele al administrador que te la asigne antes de registrar ingresos.');

        $this->assertSame(0, IncomeMovement::count());
    }

    public function test_get_income_movements_list(): void
    {
        // Register 2 incomes
        $this->actingAs($this->cashier)->postJson('/api/v1/income-movements', [
            'type' => 'equipment_sale',
            'amount' => 500,
        ]);

        $this->actingAs($this->cashier)->postJson('/api/v1/income-movements', [
            'type' => 'service_fee',
            'amount' => 100,
        ]);

        $resp = $this->actingAs($this->cashier)
            ->getJson('/api/v1/income-movements')
            ->assertStatus(200)
            ->assertJsonCount(2, 'data');

        $data = $resp->json('data');
        $this->assertSame('equipment_sale', $data[0]['type']);
        $this->assertSame('service_fee', $data[1]['type']);
    }

    public function test_cashier_only_sees_own_income(): void
    {
        $cashier2 = User::create([
            'name' => 'Cashier 2', 'email' => 'cashier2@test.com', 'password' => bcrypt('x'),
            'company_id' => $this->company->id, 'store_id' => $this->storeA->id,
        ]);
        $this->assignRole($cashier2, 'cajero');

        $register2 = CashRegister::create(['store_id' => $this->storeA->id, 'name' => 'Caja 2']);
        $session2 = CashRegisterSession::create([
            'register_id' => $register2->id,
            'user_id' => $cashier2->id,
            'opening_cash' => 500,
            'status' => 'open',
            'opened_at' => now(),
        ]);

        // Register incomes from both cashiers
        $this->actingAs($this->cashier)->postJson('/api/v1/income-movements', [
            'type' => 'equipment_sale',
            'amount' => 500,
        ]);

        $this->actingAs($cashier2)->postJson('/api/v1/income-movements', [
            'type' => 'service_fee',
            'amount' => 200,
        ]);

        // Cashier 1 should only see their own
        $resp = $this->actingAs($this->cashier)
            ->getJson('/api/v1/income-movements')
            ->assertStatus(200)
            ->assertJsonCount(1, 'data');

        $this->assertEquals(500.0, $resp->json('data.0.amount'), '', 0.01);
    }

    public function test_manager_can_view_all_incomes_in_store(): void
    {
        $this->actingAs($this->cashier)->postJson('/api/v1/income-movements', [
            'type' => 'equipment_sale',
            'amount' => 500,
        ]);

        $resp = $this->actingAs($this->manager)
            ->getJson('/api/v1/income-movements')
            ->assertStatus(200)
            ->assertJsonCount(1, 'data');
    }

    public function test_delete_income_cascades_to_cash_movement_via_service(): void
    {
        // Register income
        $service = app(IncomeService::class);
        $movement = $service->registerIncome(
            type: 'vendor_refund',
            amount: 300.00,
            description: 'Devolución proveedor',
            userId: $this->cashier->id,
            storeId: $this->storeA->id,
        );

        $cashMovementId = $movement->cash_movement_id;
        $this->assertSame(1, CashMovement::count());
        $this->assertNotNull($cashMovementId);

        // Delete via service
        $service->deleteMovement($movement, $this->admin);

        // Both should be gone
        $this->assertSame(0, IncomeMovement::count());
        $this->assertSame(0, CashMovement::count());

        // Should be logged
        $this->assertDatabaseHas('system_logs', [
            'action' => 'income_movement.deleted',
        ]);
    }

    public function test_income_amounts_rounded_to_two_decimals(): void
    {
        $this->actingAs($this->cashier)
            ->postJson('/api/v1/income-movements', [
                'type' => 'service_fee',
                'amount' => 100.12345,
            ])
            ->assertStatus(201);

        $movement = IncomeMovement::first();
        $this->assertSame(100.12, (float) $movement->amount);

        $cashMovement = CashMovement::find($movement->cash_movement_id);
        $this->assertSame(100.12, (float) $cashMovement->amount);
    }

    public function test_income_with_description_stores_correctly(): void
    {
        $this->actingAs($this->cashier)
            ->postJson('/api/v1/income-movements', [
                'type' => 'equipment_sale',
                'amount' => 150,
                'description' => '  Samsung Galaxy S21 (usado)  ',
            ])
            ->assertStatus(201);

        $movement = IncomeMovement::first();
        $this->assertSame('Samsung Galaxy S21 (usado)', $movement->description);
    }
}
