<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\CashRegister;
use App\Models\CashRegisterSession;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Modelo "una caja por persona" (sesión = caja, 2026-05-30).
 *
 * Antes: una caja física solo admitía 1 sesión abierta; el segundo usuario
 * (gerente/admin/otro cajero) chocaba con "Esta caja está abierta por otro
 * usuario" y `activeSession` lo metía a operar el corte ajeno. Joel pidió que
 * cada quien abra su PROPIO corte y que varios vendan en paralelo en la misma
 * tienda. Estos tests fijan ese invariante.
 */
class CashSessionConcurrencyTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;
    private Store $store;
    private CashRegister $register;

    protected function setUp(): void
    {
        parent::setUp();

        $this->company = Company::create(['name' => 'Tadaima Test']);
        $this->store = Store::create([
            'company_id' => $this->company->id,
            'name' => 'Tienda Centro',
            'active' => true,
        ]);
        $this->register = CashRegister::create([
            'store_id' => $this->store->id,
            'name' => 'Caja 1 — Tienda Centro',
            'active' => true,
        ]);
    }

    public function test_two_users_can_open_their_own_caja_in_the_same_store(): void
    {
        $cashierA = $this->makeUser('a@test.com', 'Juan');
        $cashierB = $this->makeUser('b@test.com', 'María');

        // Ambos seleccionan la misma caja física de la tienda; el backend les
        // crea su caja PERSONAL "{usuario} · {tienda}".
        $this->actingAs($cashierA)
            ->postJson('/api/v1/cash/open', ['register_id' => $this->register->id, 'opening_cash' => 500])
            ->assertCreated();
        $this->actingAs($cashierB)
            ->postJson('/api/v1/cash/open', ['register_id' => $this->register->id, 'opening_cash' => 300])
            ->assertCreated();

        // Dos sesiones abiertas en la tienda, en dos cajas DISTINTAS (personales).
        $this->assertSame(2, $this->openSessionsInStore());

        $regA = CashRegister::where('owner_user_id', $cashierA->id)->first();
        $regB = CashRegister::where('owner_user_id', $cashierB->id)->first();
        $this->assertNotNull($regA);
        $this->assertNotNull($regB);
        $this->assertNotSame($regA->id, $regB->id);
        $this->assertSame('Juan · Tienda Centro', $regA->name);
        $this->assertSame('María · Tienda Centro', $regB->name);
    }

    public function test_same_user_opening_twice_gets_own_conflict(): void
    {
        $cashier = $this->makeUser('a@test.com');

        $this->actingAs($cashier)
            ->postJson('/api/v1/cash/open', ['register_id' => $this->register->id, 'opening_cash' => 500])
            ->assertCreated();

        $this->actingAs($cashier)
            ->postJson('/api/v1/cash/open', ['register_id' => $this->register->id, 'opening_cash' => 100])
            ->assertStatus(409)
            ->assertJsonPath('conflict', 'own');
    }

    public function test_user_does_not_inherit_another_users_session(): void
    {
        $cashierA = $this->makeUser('a@test.com');
        $cashierB = $this->makeUser('b@test.com');

        // A abre su sesión en la tienda.
        $this->actingAs($cashierA)
            ->postJson('/api/v1/cash/open', ['register_id' => $this->register->id, 'opening_cash' => 500])
            ->assertCreated();

        // B (misma tienda, sin sesión propia) NO debe heredar la de A.
        $this->actingAs($cashierB)
            ->getJson('/api/v1/cash/session')
            ->assertOk()
            ->assertJsonPath('data', null);
    }

    public function test_each_user_closes_only_their_own_session(): void
    {
        $cashierA = $this->makeUser('a@test.com');
        $cashierB = $this->makeUser('b@test.com');

        $this->actingAs($cashierA)
            ->postJson('/api/v1/cash/open', ['register_id' => $this->register->id, 'opening_cash' => 500])
            ->assertCreated();
        $this->actingAs($cashierB)
            ->postJson('/api/v1/cash/open', ['register_id' => $this->register->id, 'opening_cash' => 300])
            ->assertCreated();

        // B cierra: solo cierra la suya, la de A sigue abierta.
        $this->actingAs($cashierB)
            ->postJson('/api/v1/cash/close', ['closing_cash' => 300])
            ->assertOk();

        $this->assertSame(1, $this->openSessionsInStore());
        $this->assertSame(CashRegisterSession::STATUS_OPEN,
            CashRegisterSession::where('user_id', $cashierA->id)->value('status'));
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    /** Sesiones abiertas cuyas cajas pertenecen a la tienda de prueba. */
    private function openSessionsInStore(): int
    {
        return CashRegisterSession::where('status', CashRegisterSession::STATUS_OPEN)
            ->whereHas('register', fn ($q) => $q->where('store_id', $this->store->id))
            ->count();
    }

    private function makeUser(string $email, string $name = ''): User
    {
        $user = User::create([
            'name' => $name !== '' ? $name : $email,
            'email' => $email,
            'password' => bcrypt('password'),
            'company_id' => $this->company->id,
            'store_id' => $this->store->id,
            'active' => true,
        ]);

        $roleId = DB::table('roles')->where('name', 'cajero')->value('id')
            ?? DB::table('roles')->insertGetId([
                'name' => 'cajero',
                'guard_name' => 'api',
                'created_at' => now(),
                'updated_at' => now(),
            ]);

        DB::table('model_has_roles')->insert([
            'role_id' => $roleId,
            'model_type' => User::class,
            'model_id' => $user->id,
        ]);

        return $user;
    }
}
