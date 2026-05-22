<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Product;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

class NotificationsStockAlertTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;
    private Store $store;
    private User $admin;
    private User $manager;
    private User $cashier;
    private Product $product;

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

        $this->product = Product::create([
            'name' => 'One Piece Vol. 1',
            'sku' => 'OP-1',
            'active' => true,
            'product_type' => Product::TYPE_PRODUCT,
        ]);

        $this->assignRole($this->admin, 'admin');
        $this->assignRole($this->manager, 'gerente');
        $this->assignRole($this->cashier, 'cajero');
    }

    public function test_cashier_notifies_manager_and_admin_without_duplicates(): void
    {
        $this->actingAs($this->cashier, 'sanctum')
            ->postJson('/api/v1/notifications/stock-alert', [
                'product_id' => $this->product->id,
                'stock' => 2,
                'kind' => 'product',
            ])
            ->assertCreated()
            ->assertJsonPath('data.created_or_updated', 2);

        $this->assertDatabaseCount('notifications', 2);
        $this->assertDatabaseHas('notifications', [
            'user_id' => $this->admin->id,
            'reference_id' => $this->product->id,
            'type' => 'stock_alert_s' . $this->store->id,
        ]);
        $this->assertDatabaseHas('notifications', [
            'user_id' => $this->manager->id,
            'reference_id' => $this->product->id,
            'type' => 'stock_alert_s' . $this->store->id,
        ]);

        DB::table('notifications')
            ->where('user_id', $this->admin->id)
            ->update(['read_at' => now()]);

        $this->actingAs($this->cashier, 'sanctum')
            ->postJson('/api/v1/notifications/stock-alert', [
                'product_id' => $this->product->id,
                'stock' => 0,
                'kind' => 'product',
            ])
            ->assertCreated();

        $this->assertDatabaseCount('notifications', 2);
        $this->assertDatabaseHas('notifications', [
            'user_id' => $this->admin->id,
            'reference_id' => $this->product->id,
            'read_at' => null,
        ]);

        $adminNotification = DB::table('notifications')
            ->where('user_id', $this->admin->id)
            ->where('reference_id', $this->product->id)
            ->first();

        $this->assertNotNull($adminNotification);
        $this->assertStringContainsString('agotado', $adminNotification->message);
    }

    public function test_manager_only_notifies_admin(): void
    {
        $this->actingAs($this->manager, 'sanctum')
            ->postJson('/api/v1/notifications/stock-alert', [
                'product_id' => $this->product->id,
                'stock' => 4,
                'kind' => 'product',
            ])
            ->assertCreated()
            ->assertJsonPath('data.created_or_updated', 1);

        $this->assertDatabaseCount('notifications', 1);
        $this->assertDatabaseHas('notifications', [
            'user_id' => $this->admin->id,
            'reference_id' => $this->product->id,
        ]);
        $this->assertDatabaseMissing('notifications', [
            'user_id' => $this->manager->id,
            'reference_id' => $this->product->id,
        ]);
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
