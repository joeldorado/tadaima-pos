<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Store;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Bug 2026-06-24: renombrar una bodega (Admin > Bodegas) mostraba "actualizada"
 * pero al recargar no cambiaba. Causa: WarehouseResource devolvía el nombre de
 * la TIENDA (cambio del 2026-06-19 para selectores de Traslados), enmascarando
 * el nombre real de la bodega aunque sí se persistía. Ahora `name` es el real y
 * la tienda se expone aparte en `store`.
 */
class WarehouseRenameTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;
    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $this->company = Company::create(['name' => 'Tadaima QA']);
        $store = Store::create(['company_id' => $this->company->id, 'name' => 'QA', 'active' => true]);
        $this->user = User::create([
            'name'       => 'QA Admin',
            'email'      => 'qa-admin@test.com',
            'password'   => bcrypt('password'),
            'company_id' => $this->company->id,
            'store_id'   => $store->id,
        ]);

        $roleId = DB::table('roles')->insertGetId([
            'name'       => 'admin',
            'guard_name' => 'api',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('model_has_roles')->insert([
            'role_id'    => $roleId,
            'model_type' => User::class,
            'model_id'   => $this->user->id,
        ]);
    }

    public function test_rename_warehouse_persists_and_returns_real_name(): void
    {
        $store = Store::create(['company_id' => $this->company->id, 'name' => 'Centro', 'active' => true]);
        $wh = Warehouse::create([
            'company_id' => $this->company->id,
            'store_id'   => $store->id,
            'name'       => 'Exhibición',
            'type'       => 'store',
            'active'     => true,
        ]);

        $resp = $this->actingAs($this->user, 'sanctum')
            ->putJson("/api/v1/warehouses/{$wh->id}", ['name' => 'Exhibición Centro']);

        $resp->assertOk();
        // La respuesta devuelve el nombre REAL de la bodega, NO el de la tienda.
        $resp->assertJsonPath('data.name', 'Exhibición Centro');
        $this->assertDatabaseHas('warehouses', ['id' => $wh->id, 'name' => 'Exhibición Centro']);
    }

    public function test_get_warehouses_returns_real_name_and_store_separately(): void
    {
        $store = Store::create(['company_id' => $this->company->id, 'name' => 'Centro', 'active' => true]);
        $wh = Warehouse::create([
            'company_id' => $this->company->id,
            'store_id'   => $store->id,
            'name'       => 'Bodega Centro',
            'type'       => 'bodega',
            'active'     => true,
        ]);

        $get = $this->actingAs($this->user, 'sanctum')
            ->getJson("/api/v1/warehouses?store_id={$store->id}");

        $get->assertOk();
        $row = collect($get->json('data'))->firstWhere('id', $wh->id);
        $this->assertNotNull($row);
        // name = nombre real de la bodega; la tienda sigue accesible en `store`.
        $this->assertSame('Bodega Centro', $row['name']);
        $this->assertSame('Centro', $row['store']['name']);
    }
}
