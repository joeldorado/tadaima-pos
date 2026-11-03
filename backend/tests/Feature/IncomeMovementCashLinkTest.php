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
use App\Support\ActivityGroups;
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
        $this->assertStringContainsString('Ingreso: Venta de Equipo', $cashMovement->description);
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
            ->assertJsonPath('error', 'Necesitas una caja abierta para registrar un ingreso.');

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

    public function test_cash_payment_method_creates_cash_movement(): void
    {
        $this->actingAs($this->cashier)
            ->postJson('/api/v1/income-movements', [
                'type' => 'other', 'amount' => 100, 'payment_method' => 'cash',
            ])
            ->assertStatus(201);

        $movement = IncomeMovement::first();
        $this->assertSame('cash', $movement->payment_method);
        $this->assertNotNull($movement->cash_movement_id);
        $this->assertSame(1, CashMovement::count());
    }

    public function test_card_payment_method_does_not_create_cash_movement(): void
    {
        $this->actingAs($this->cashier)
            ->postJson('/api/v1/income-movements', [
                'type' => 'other', 'amount' => 100, 'payment_method' => 'card',
            ])
            ->assertStatus(201);

        $movement = IncomeMovement::first();
        $this->assertSame('card', $movement->payment_method);
        $this->assertNull($movement->cash_movement_id);
        $this->assertSame(0, CashMovement::count());
    }

    public function test_transfer_payment_method_does_not_create_cash_movement(): void
    {
        $this->actingAs($this->cashier)
            ->postJson('/api/v1/income-movements', [
                'type' => 'other', 'amount' => 100, 'payment_method' => 'transfer',
            ])
            ->assertStatus(201);

        $movement = IncomeMovement::first();
        $this->assertSame('transfer', $movement->payment_method);
        $this->assertNull($movement->cash_movement_id);
        $this->assertSame(0, CashMovement::count());
    }

    public function test_payment_method_defaults_to_cash_when_omitted(): void
    {
        $this->actingAs($this->cashier)
            ->postJson('/api/v1/income-movements', [
                'type' => 'other', 'amount' => 100,
            ])
            ->assertStatus(201);

        $movement = IncomeMovement::first();
        $this->assertSame('cash', $movement->payment_method);
        $this->assertNotNull($movement->cash_movement_id);
    }

    public function test_invalid_payment_method_rejected(): void
    {
        $this->actingAs($this->cashier)
            ->postJson('/api/v1/income-movements', [
                'type' => 'other', 'amount' => 100, 'payment_method' => 'bitcoin',
            ])
            ->assertStatus(422);
    }

    // ── Regresiones del release 2026-11-03 ───────────────────────────────────

    public function test_admin_borra_ingreso_por_http_y_el_esperado_del_corte_baja(): void
    {
        $this->actingAs($this->cashier)->postJson('/api/v1/income-movements', [
            'type' => 'other', 'amount' => 300,
        ])->assertStatus(201);
        $movement = IncomeMovement::firstOrFail();

        $this->assertEquals(800.0, (float) $this->expectedCash());

        $this->actingAs($this->admin)
            ->deleteJson("/api/v1/income-movements/{$movement->id}")
            ->assertStatus(200);

        $this->assertSame(0, IncomeMovement::count());
        $this->assertSame(0, CashMovement::count());
        $this->assertEquals(500.0, (float) $this->expectedCash());
    }

    public function test_cajero_y_gerente_no_pueden_borrar_ingresos(): void
    {
        $this->actingAs($this->cashier)->postJson('/api/v1/income-movements', [
            'type' => 'other', 'amount' => 300,
        ])->assertStatus(201);
        $movement = IncomeMovement::firstOrFail();

        foreach ([$this->cashier, $this->manager] as $user) {
            $this->actingAs($user)
                ->deleteJson("/api/v1/income-movements/{$movement->id}")
                ->assertStatus(403);
        }
        $this->assertSame(1, IncomeMovement::count());
    }

    public function test_gerente_no_puede_ver_ingresos_de_otra_tienda(): void
    {
        $storeB = Store::where('name', 'Tienda B')->firstOrFail();
        $this->incomeInStore($this->storeA->id, 100);
        $this->incomeInStore($storeB->id, 200);

        $this->actingAs($this->manager)
            ->getJson("/api/v1/income-movements?store_id={$storeB->id}")
            ->assertStatus(403);

        // Sin filtro tampoco se cuela lo de la otra tienda.
        $this->actingAs($this->manager)
            ->getJson('/api/v1/income-movements')
            ->assertStatus(200)
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.store_id', $this->storeA->id);

        // El admin sí ve las dos.
        $this->actingAs($this->admin)
            ->getJson('/api/v1/income-movements')
            ->assertStatus(200)
            ->assertJsonCount(2, 'data');
    }

    public function test_registrar_ingreso_deja_rastro_en_actividad(): void
    {
        $this->actingAs($this->cashier)->postJson('/api/v1/income-movements', [
            'type' => 'equipment_sale', 'amount' => 450, 'payment_method' => 'card', 'description' => 'Consola',
        ])->assertStatus(201);

        $movement = IncomeMovement::firstOrFail();
        $this->assertDatabaseHas('system_logs', [
            'action'      => 'income_movement.created',
            'entity_type' => 'income_movement',
            'entity_id'   => $movement->id,
            'user_id'     => $this->cashier->id,
        ]);
        $this->assertSame('caja', ActivityGroups::logGroup('income_movement.created'));
        $this->assertSame('caja', ActivityGroups::logGroup('income_movement.deleted'));
    }

    // ── Huecos cerrados (2026-11-03) ─────────────────────────────────────────

    public function test_admin_sin_elegir_tienda_usa_la_de_su_caja(): void
    {
        $storeB = Store::where('name', 'Tienda B')->firstOrFail();
        $this->adminSession->register->update(['store_id' => $storeB->id]);

        $this->actingAs($this->admin)->postJson('/api/v1/income-movements', [
            'type' => 'other', 'amount' => 100,
        ])->assertStatus(201);

        $this->assertSame($storeB->id, IncomeMovement::firstOrFail()->store_id);
    }

    public function test_la_entrada_del_corte_y_el_log_usan_el_tipo_legible(): void
    {
        $this->actingAs($this->cashier)->postJson('/api/v1/income-movements', [
            'type' => 'service_fee', 'amount' => 100, 'description' => 'Reparación',
        ])->assertStatus(201);

        $this->assertSame('Ingreso: Comisión/Servicio · Reparación', CashMovement::firstOrFail()->description);
        $this->assertStringContainsString('Comisión/Servicio', (string) \DB::table('system_logs')
            ->where('action', 'income_movement.created')->value('description'));
    }

    public function test_con_rango_de_fechas_no_topa_en_200_y_sin_rango_si(): void
    {
        for ($i = 0; $i < 201; $i++) {
            $this->incomeInStore($this->storeA->id, 1);
        }
        $today = now('America/Tijuana')->toDateString();

        $this->actingAs($this->admin)
            ->getJson("/api/v1/income-movements?from={$today}&to={$today}")
            ->assertStatus(200)->assertJsonCount(201, 'data');

        $this->actingAs($this->admin)
            ->getJson('/api/v1/income-movements')
            ->assertStatus(200)->assertJsonCount(200, 'data');
    }

    public function test_nota_de_255_caracteres_cabe_en_la_entrada_del_corte(): void
    {
        $this->actingAs($this->cashier)->postJson('/api/v1/income-movements', [
            'type' => 'service_fee', 'amount' => 100, 'description' => str_repeat('x', 255),
        ])->assertStatus(201);

        $this->assertSame(255, mb_strlen((string) CashMovement::firstOrFail()->description));
        $this->assertSame(255, mb_strlen((string) IncomeMovement::firstOrFail()->description));
    }

    public function test_caja_vieja_de_12_horas_no_recibe_ingresos(): void
    {
        $this->session->update(['opened_at' => now()->subDays(2)]);

        $resp = $this->actingAs($this->cashier)->postJson('/api/v1/income-movements', [
            'type' => 'other', 'amount' => 100,
        ])->assertStatus(422);

        $this->assertStringContainsString('Haz el corte', (string) $resp->json('error'));
        $this->assertSame(0, IncomeMovement::count());
        $this->assertSame(0, CashMovement::count());
    }

    public function test_borrar_corte_muestra_y_respalda_sus_ingresos(): void
    {
        foreach ([['cash', 300], ['card', 100]] as [$method, $amount]) {
            $this->actingAs($this->cashier)->postJson('/api/v1/income-movements', [
                'type' => 'other', 'amount' => $amount, 'payment_method' => $method,
            ])->assertStatus(201);
        }

        $preview = $this->actingAs($this->admin)
            ->getJson("/api/v1/cash/sessions/{$this->session->id}/delete-preview")
            ->assertStatus(200)->json('data');
        $this->assertSame(2, $preview['counts']['incomes']);
        $this->assertCount(2, $preview['incomes']);

        $this->actingAs($this->admin)->deleteJson("/api/v1/cash/sessions/{$this->session->id}", [
            'confirm' => 'BORRAR', 'expected' => $preview['counts'],
        ])->assertStatus(200);

        $this->assertSame(0, IncomeMovement::count());
        $meta = json_decode((string) \DB::table('system_logs')->where('action', 'cash_session.deleted')->value('meta'), true);
        $this->assertCount(2, $meta['archive']['incomes']);
    }

    public function test_borrar_corte_no_procede_si_entro_un_ingreso_tras_la_vista_previa(): void
    {
        $preview = $this->actingAs($this->admin)
            ->getJson("/api/v1/cash/sessions/{$this->session->id}/delete-preview")
            ->assertStatus(200)->json('data');

        $this->incomeInStore($this->storeA->id, 50);

        $this->actingAs($this->admin)->deleteJson("/api/v1/cash/sessions/{$this->session->id}", [
            'confirm' => 'BORRAR', 'expected' => $preview['counts'],
        ])->assertStatus(422);

        $this->assertSame(1, IncomeMovement::count());
    }

    private function incomeInStore(int $storeId, float $amount): void
    {
        IncomeMovement::create([
            'register_session_id' => $this->session->id,
            'store_id'            => $storeId,
            'type'                => 'other',
            'payment_method'      => 'card',
            'amount'              => $amount,
            'user_id'             => $this->cashier->id,
        ]);
    }

    /** Esperado del corte de la caja del cajero, calculado por el backend. */
    private function expectedCash(): mixed
    {
        $range = 'from='.now()->subDay()->toDateString().'&to='.now()->addDay()->toDateString();
        $rows = $this->actingAs($this->admin)
            ->getJson("/api/v1/reports/cash?{$range}")
            ->assertStatus(200)
            ->json('data.sessions');

        return collect($rows)->firstWhere('id', $this->session->id)['expected_cash'] ?? null;
    }
}
