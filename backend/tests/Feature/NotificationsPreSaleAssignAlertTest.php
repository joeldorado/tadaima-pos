<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\PreSaleCatalog;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * POST /notifications/presale-assign-alert
 *
 * El cajero pide habilitar (asignar cupo en store_limits) un catálogo de
 * preventa en su tienda → notifica al gerente de la tienda + admins.
 */
class NotificationsPreSaleAssignAlertTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;
    private Store $store;
    private User $admin;
    private User $manager;
    private User $cashier;
    private PreSaleCatalog $catalog;

    protected function setUp(): void
    {
        parent::setUp();

        $this->company = Company::create(['name' => 'Tadaima Test']);
        $this->manager = User::create([
            'name' => 'Gerente Centro',
            'email' => 'gerente@test.com',
            'password' => bcrypt('password'),
            'company_id' => $this->company->id,
            'active' => true,
        ]);
        $this->store = Store::create([
            'company_id' => $this->company->id,
            'name' => 'Tienda Centro',
            'manager_id' => $this->manager->id,
            'active' => true,
        ]);
        $this->manager->update(['store_id' => $this->store->id]);

        $this->admin = User::create([
            'name' => 'Admin Master',
            'email' => 'admin@test.com',
            'password' => bcrypt('password'),
            'company_id' => $this->company->id,
            'store_id' => $this->store->id,
            'active' => true,
        ]);

        $this->cashier = User::create([
            'name' => 'Cajero Centro',
            'email' => 'cajero@test.com',
            'password' => bcrypt('password'),
            'company_id' => $this->company->id,
            'store_id' => $this->store->id,
            'active' => true,
        ]);

        $this->catalog = PreSaleCatalog::create([
            'product_name' => 'Figura Goku Preventa',
            'price_1' => 1000,
            'advance_payment' => 300,
            'status' => PreSaleCatalog::STATUS_PUBLISHED,
        ]);

        $this->assignRole($this->admin, 'admin');
        $this->assignRole($this->manager, 'gerente');
        $this->assignRole($this->cashier, 'cajero');
    }

    public function test_cashier_notifies_manager_and_admin(): void
    {
        $this->actingAs($this->cashier, 'sanctum')
            ->postJson('/api/v1/notifications/presale-assign-alert', [
                'catalog_id' => $this->catalog->id,
            ])
            ->assertCreated()
            ->assertJsonPath('data.created_or_updated', 2);

        $this->assertDatabaseCount('notifications', 2);
        $this->assertDatabaseHas('notifications', [
            'user_id' => $this->manager->id,
            'reference_id' => $this->catalog->id,
            'type' => 'presale_assign_s' . $this->store->id,
        ]);
        $this->assertDatabaseHas('notifications', [
            'user_id' => $this->admin->id,
            'reference_id' => $this->catalog->id,
            'type' => 'presale_assign_s' . $this->store->id,
        ]);
    }

    public function test_manager_is_found_by_store_id_when_store_has_no_manager_id(): void
    {
        // Caso real de prod (QA 2026-06-11): las tiendas creadas por UI quedan
        // con manager_id=NULL; el gerente se relaciona solo por users.store_id.
        $this->store->update(['manager_id' => null]);

        $this->actingAs($this->cashier, 'sanctum')
            ->postJson('/api/v1/notifications/presale-assign-alert', [
                'catalog_id' => $this->catalog->id,
            ])
            ->assertCreated()
            ->assertJsonPath('data.created_or_updated', 2);

        $this->assertDatabaseHas('notifications', [
            'user_id' => $this->manager->id,
            'reference_id' => $this->catalog->id,
            'type' => 'presale_assign_s' . $this->store->id,
        ]);
    }

    public function test_resend_updates_instead_of_duplicating(): void
    {
        $this->actingAs($this->cashier, 'sanctum')
            ->postJson('/api/v1/notifications/presale-assign-alert', ['catalog_id' => $this->catalog->id])
            ->assertCreated();

        // Gerente la lee; el cajero vuelve a avisar → misma fila, unread otra vez.
        DB::table('notifications')->where('user_id', $this->manager->id)->update(['read_at' => now()]);

        $this->actingAs($this->cashier, 'sanctum')
            ->postJson('/api/v1/notifications/presale-assign-alert', ['catalog_id' => $this->catalog->id])
            ->assertCreated();

        $this->assertDatabaseCount('notifications', 2);
        $this->assertDatabaseHas('notifications', [
            'user_id' => $this->manager->id,
            'reference_id' => $this->catalog->id,
            'read_at' => null,
        ]);
    }

    public function test_manager_notifies_only_admins(): void
    {
        $this->actingAs($this->manager, 'sanctum')
            ->postJson('/api/v1/notifications/presale-assign-alert', ['catalog_id' => $this->catalog->id])
            ->assertCreated()
            ->assertJsonPath('data.created_or_updated', 1);

        $this->assertDatabaseCount('notifications', 1);
        $this->assertDatabaseHas('notifications', [
            'user_id' => $this->admin->id,
            'reference_id' => $this->catalog->id,
        ]);
    }

    public function test_admin_cannot_send(): void
    {
        $this->actingAs($this->admin, 'sanctum')
            ->postJson('/api/v1/notifications/presale-assign-alert', ['catalog_id' => $this->catalog->id])
            ->assertStatus(403);
    }

    public function test_unknown_catalog_is_rejected(): void
    {
        $this->actingAs($this->cashier, 'sanctum')
            ->postJson('/api/v1/notifications/presale-assign-alert', ['catalog_id' => 999999])
            ->assertStatus(422);
    }

    private function assignRole(User $user, string $roleName): void
    {
        $roleId = DB::table('roles')->insertGetId([
            'name' => $roleName,
            'guard_name' => 'api',
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        DB::table('model_has_roles')->insert([
            'role_id' => $roleId,
            'model_type' => User::class,
            'model_id' => $user->id,
        ]);
    }
}
