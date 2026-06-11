<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Bug QA 2026-06-10: los usuarios creados por UI nacían con company_id NULL
 * (el frontend no manda company_id y el controller no lo derivaba). Con company
 * NULL el usuario no puede crear tiendas/bodegas (422 "No se pudo determinar la
 * empresa...") y ve/escribe settings de una company fantasma.
 *
 * Fix: UserController::store deriva company_id del admin autenticado (o de la
 * tienda asignada) + migración de backfill para los usuarios existentes.
 */
class UserCompanyDerivationTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;
    private Store $store;
    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->company = Company::create(['name' => 'Tadaima Test']);
        $this->store = Store::create([
            'company_id' => $this->company->id,
            'name' => 'Tienda Centro',
            'active' => true,
        ]);
        $this->admin = User::create([
            'name' => 'Admin',
            'email' => 'admin@test.com',
            'password' => bcrypt('password'),
            'company_id' => $this->company->id,
            'active' => true,
        ]);
    }

    public function test_new_user_inherits_company_from_creator(): void
    {
        // Payload como lo manda la UI: sin company_id
        $resp = $this->actingAs($this->admin)
            ->postJson('/api/v1/users', [
                'name' => 'Joel Dorado',
                'email' => 'joel@test.com',
                'password' => 'Password123',
                'active' => true,
            ])
            ->assertCreated();

        $created = User::find($resp->json('data.id'));
        $this->assertSame($this->company->id, $created->company_id);
    }

    public function test_new_user_derives_company_from_store_when_creator_has_none(): void
    {
        // Admin legacy con company NULL (estado pre-backfill)
        $this->admin->forceFill(['company_id' => null])->save();

        $resp = $this->actingAs($this->admin)
            ->postJson('/api/v1/users', [
                'name' => 'Cajero Centro',
                'email' => 'cajero@test.com',
                'password' => 'Password123',
                'store_id' => $this->store->id,
                'active' => true,
            ])
            ->assertCreated();

        $created = User::find($resp->json('data.id'));
        $this->assertSame($this->company->id, $created->company_id);
    }

    public function test_new_user_with_derived_company_can_create_store(): void
    {
        $resp = $this->actingAs($this->admin)
            ->postJson('/api/v1/users', [
                'name' => 'Otro Admin',
                'email' => 'admin2@test.com',
                'password' => 'Password123',
                'active' => true,
            ])
            ->assertCreated();

        $newAdmin = User::find($resp->json('data.id'));

        // El bug original: con company NULL este POST devolvía 422
        $this->actingAs($newAdmin)
            ->postJson('/api/v1/stores', ['name' => 'Tienda Test QA'])
            ->assertCreated();
    }

    public function test_backfill_migration_fills_null_company_ids(): void
    {
        $conTienda = User::create([
            'name' => 'Gerente legacy',
            'email' => 'gerente@test.com',
            'password' => bcrypt('password'),
            'store_id' => $this->store->id,
            'active' => true,
        ]);
        $sinTienda = User::create([
            'name' => 'Admin legacy',
            'email' => 'admin.legacy@test.com',
            'password' => bcrypt('password'),
            'active' => true,
        ]);
        $this->assertNull($conTienda->company_id);
        $this->assertNull($sinTienda->company_id);

        // RefreshDatabase ya la corrió en el setup (antes de crear los users);
        // desmarcarla para poder ejecutarla sobre los datos legacy de este test.
        DB::table('migrations')->where('migration', 'like', '%backfill_missing_user_company_id%')->delete();
        Artisan::call('migrate', [
            '--path' => 'database/migrations/2026_06_10_000001_backfill_missing_user_company_id.php',
            '--force' => true,
        ]);

        // Con tienda → company de la tienda; sin tienda → única company existente
        $this->assertSame($this->company->id, $conTienda->fresh()->company_id);
        $this->assertSame($this->company->id, $sinTienda->fresh()->company_id);

        // Idempotente: correrla de nuevo no truena ni cambia nada
        DB::table('migrations')->where('migration', 'like', '%backfill_missing_user_company_id%')->delete();
        Artisan::call('migrate', [
            '--path' => 'database/migrations/2026_06_10_000001_backfill_missing_user_company_id.php',
            '--force' => true,
        ]);
        $this->assertSame($this->company->id, $conTienda->fresh()->company_id);
    }
}
