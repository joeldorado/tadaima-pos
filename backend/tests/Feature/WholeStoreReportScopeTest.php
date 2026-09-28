<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Sale;
use App\Models\Store;
use App\Models\Supply;
use App\Models\SupplyMovement;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Reporte de TODA la tienda desde el Corte de Caja (Joel 2026-09-27): con
 * ?whole_store=1 el cajero ve las ventas e insumos de todos los de su tienda.
 * Sin el parámetro (Historial de Ventas) sigue viendo solo lo suyo, y nunca
 * ve otra tienda.
 */
class WholeStoreReportScopeTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;

    private Store $storeA;

    private Store $storeB;

    private User $cajeroA1;

    private User $cajeroA2;

    private User $cajeroB;

    protected function setUp(): void
    {
        parent::setUp();

        $this->company = Company::create(['name' => 'Tadaima Test']);
        $this->storeA = Store::create(['company_id' => $this->company->id, 'name' => 'Tienda A', 'active' => true]);
        $this->storeB = Store::create(['company_id' => $this->company->id, 'name' => 'Tienda B', 'active' => true]);

        $this->cajeroA1 = $this->makeCajero('cajero1.a@test.com', $this->storeA->id);
        $this->cajeroA2 = $this->makeCajero('cajero2.a@test.com', $this->storeA->id);
        $this->cajeroB = $this->makeCajero('cajero.b@test.com', $this->storeB->id);

        foreach ([[$this->storeA, $this->cajeroA1], [$this->storeA, $this->cajeroA2], [$this->storeB, $this->cajeroB]] as [$store, $user]) {
            Sale::create([
                'store_id' => $store->id, 'user_id' => $user->id,
                'subtotal' => 100, 'discount' => 0, 'total' => 100,
                'status' => Sale::STATUS_COMPLETED,
            ]);
            $supply = Supply::create([
                'company_id' => $this->company->id, 'store_id' => $store->id,
                'name' => 'Cinta '.$user->id, 'category' => 'Empaque', 'unit' => 'rollo',
            ]);
            SupplyMovement::create([
                'supply_id' => $supply->id, 'type' => 'purchase', 'quantity' => 1,
                'amount' => 50, 'user_id' => $user->id, 'money_source' => 'store',
            ]);
        }
    }

    private function range(): string
    {
        return 'from='.now()->subDay()->toDateString().'&to='.now()->addDay()->toDateString();
    }

    /** @return list<int> */
    private function saleUserIds(User $as, string $query): array
    {
        return collect($this->actingAs($as)->getJson('/api/v1/sales?'.$query)->assertOk()->json('data.data'))
            ->pluck('user_id')->map(fn ($id) => (int) $id)->sort()->values()->all();
    }

    /** @return list<int> */
    private function supplyUserIds(User $as, string $query): array
    {
        return collect($this->actingAs($as)->getJson('/api/v1/supplies/movements?'.$query)->assertOk()->json('data'))
            ->pluck('user.id')->map(fn ($id) => (int) $id)->sort()->values()->all();
    }

    public function test_sin_whole_store_el_cajero_solo_ve_sus_ventas(): void
    {
        $this->assertSame([$this->cajeroA2->id], $this->saleUserIds($this->cajeroA2, $this->range()));
    }

    public function test_con_whole_store_el_cajero_ve_las_ventas_de_toda_su_tienda(): void
    {
        $this->assertSame(
            [$this->cajeroA1->id, $this->cajeroA2->id],
            $this->saleUserIds($this->cajeroA2, $this->range().'&whole_store=1'),
        );
    }

    public function test_whole_store_nunca_abre_otra_tienda(): void
    {
        $ids = $this->saleUserIds($this->cajeroA2, $this->range().'&whole_store=1&store_id='.$this->storeB->id);

        $this->assertNotContains($this->cajeroB->id, $ids);
    }

    public function test_insumos_sin_whole_store_solo_los_suyos(): void
    {
        $this->assertSame([$this->cajeroA2->id], $this->supplyUserIds($this->cajeroA2, $this->range()));
    }

    public function test_insumos_con_whole_store_toda_su_tienda_y_no_otra(): void
    {
        $this->assertSame(
            [$this->cajeroA1->id, $this->cajeroA2->id],
            $this->supplyUserIds($this->cajeroA2, $this->range().'&whole_store=1&store_id='.$this->storeB->id),
        );
    }

    private function makeCajero(string $email, int $storeId): User
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
