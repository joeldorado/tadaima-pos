<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\CashRegister;
use App\Models\CashRegisterSession;
use App\Models\Company;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Cortes visibles para toda la tienda (Joel 2026-09-27): los cajeros ven los
 * cortes de los demás cajeros de SU tienda, igual que el gerente, para cerrar
 * el día cuando el gerente no está. Solo lectura — la caja viva de otro
 * (/cash/movements) sigue bloqueada, y otra tienda sigue fuera.
 */
class CashCutsVisibilityTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;

    private User $cajeroA1;

    private User $cajeroA2;

    private User $cajeroB;

    private CashRegisterSession $sessionA1;

    protected function setUp(): void
    {
        parent::setUp();

        $this->company = Company::create(['name' => 'Tadaima Test']);
        $storeA = Store::create(['company_id' => $this->company->id, 'name' => 'Tienda A', 'active' => true]);
        $storeB = Store::create(['company_id' => $this->company->id, 'name' => 'Tienda B', 'active' => true]);

        $this->cajeroA1 = $this->makeUser('cajero1.a@test.com', $storeA->id);
        $this->cajeroA2 = $this->makeUser('cajero2.a@test.com', $storeA->id);
        $this->cajeroB = $this->makeUser('cajero.b@test.com', $storeB->id);

        $registerA1 = CashRegister::create(['store_id' => $storeA->id, 'name' => 'Caja A1', 'active' => true]);
        $registerA2 = CashRegister::create(['store_id' => $storeA->id, 'name' => 'Caja A2', 'active' => true]);
        $this->sessionA1 = $this->closedSession($registerA1, $this->cajeroA1);
        $this->closedSession($registerA2, $this->cajeroA2);
    }

    private function range(): string
    {
        return 'from='.now()->subDay()->toDateString().'&to='.now()->addDay()->toDateString();
    }

    public function test_cajero_ve_los_cortes_de_los_demas_cajeros_de_su_tienda(): void
    {
        $ids = collect($this->actingAs($this->cajeroA2)
            ->getJson('/api/v1/reports/cash?'.$this->range())
            ->assertOk()
            ->json('data.sessions'))->pluck('user.id')->all();

        $this->assertEqualsCanonicalizing([$this->cajeroA1->id, $this->cajeroA2->id], $ids);
    }

    public function test_cajero_abre_el_detalle_del_corte_de_otro_cajero_de_su_tienda(): void
    {
        $this->actingAs($this->cajeroA2)
            ->getJson("/api/v1/reports/cash/{$this->sessionA1->id}/detail")
            ->assertOk();
    }

    public function test_filtro_por_usuario_sigue_funcionando_dentro_de_la_tienda(): void
    {
        $ids = collect($this->actingAs($this->cajeroA2)
            ->getJson('/api/v1/reports/cash?'.$this->range().'&user_id='.$this->cajeroA1->id)
            ->assertOk()
            ->json('data.sessions'))->pluck('user.id')->unique()->values()->all();

        $this->assertSame([$this->cajeroA1->id], $ids);
    }

    public function test_cajero_de_otra_tienda_no_ve_los_cortes(): void
    {
        $this->actingAs($this->cajeroB)
            ->getJson('/api/v1/reports/cash?'.$this->range().'&store_id='.$this->sessionA1->register->store_id)
            ->assertOk()
            ->assertJsonCount(0, 'data.sessions');

        $this->actingAs($this->cajeroB)
            ->getJson("/api/v1/reports/cash/{$this->sessionA1->id}/detail")
            ->assertForbidden();
    }

    public function test_la_caja_viva_de_otro_cajero_sigue_bloqueada(): void
    {
        $this->actingAs($this->cajeroA2)
            ->getJson("/api/v1/cash/movements?session_id={$this->sessionA1->id}")
            ->assertForbidden();
    }

    private function closedSession(CashRegister $register, User $user): CashRegisterSession
    {
        return CashRegisterSession::create([
            'register_id' => $register->id, 'user_id' => $user->id,
            'opening_cash' => 100, 'closing_cash' => 100, 'expected_cash' => 100, 'difference' => 0,
            'status' => 'closed', 'opened_at' => now()->subHours(3), 'closed_at' => now()->subHour(),
            'local_date' => now()->toDateString(),
        ]);
    }

    private function makeUser(string $email, int $storeId): User
    {
        $user = User::create([
            'name' => $email, 'email' => $email, 'password' => bcrypt('password'),
            'company_id' => $this->company->id, 'store_id' => $storeId, 'active' => true,
        ]);
        $roleId = DB::table('roles')->where('name', 'cajero')->value('id')
            ?? DB::table('roles')->insertGetId([
                'name' => 'cajero', 'guard_name' => 'api',
                'created_at' => now(), 'updated_at' => now(),
            ]);
        DB::table('model_has_roles')->insert([
            'role_id' => $roleId, 'model_type' => User::class, 'model_id' => $user->id,
        ]);

        return $user;
    }
}
