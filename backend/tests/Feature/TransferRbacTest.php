<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Product;
use App\Models\Store;
use App\Models\Transfer;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * RBAC de traslados — flujo 2026-06-11 (alineado a la UI de Ruben):
 * - Solo admin y gerente crean traslados (cajero 403).
 * - Gerente solicita viendo stock de TODAS las tiendas: origen libre, pero su
 *   tienda debe ser origen o destino.
 * - Solo admin completa (mueve inventario).
 * - Cancela admin o el gerente que creó la solicitud.
 */
class TransferRbacTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;
    private Store $storeA;
    private Store $storeB;
    private Warehouse $whA;
    private Warehouse $whB;
    private Product $product;
    private User $admin;
    private User $managerA;
    private User $managerB;
    private User $cashierA;

    protected function setUp(): void
    {
        parent::setUp();

        $this->company = Company::create(['name' => 'Tadaima Test']);
        $this->storeA  = Store::create(['company_id' => $this->company->id, 'name' => 'Tienda A', 'active' => true]);
        $this->storeB  = Store::create(['company_id' => $this->company->id, 'name' => 'Tienda B', 'active' => true]);
        $this->whA = Warehouse::create(['company_id' => $this->company->id, 'store_id' => $this->storeA->id, 'name' => 'Bodega A', 'type' => 'store', 'active' => true]);
        $this->whB = Warehouse::create(['company_id' => $this->company->id, 'store_id' => $this->storeB->id, 'name' => 'Bodega B', 'type' => 'store', 'active' => true]);

        $this->product = Product::create([
            'company_id' => $this->company->id,
            'name' => 'Producto Test',
            'sku' => 'TEST-001',
            'price_1' => 100,
            'active' => true,
        ]);
        // Stock en bodega B (la "otra tienda" desde la que pide el gerente A).
        DB::table('inventory')->insert([
            ['product_id' => $this->product->id, 'warehouse_id' => $this->whB->id, 'quantity' => 10],
            ['product_id' => $this->product->id, 'warehouse_id' => $this->whA->id, 'quantity' => 10],
        ]);

        $this->admin    = $this->makeUser('admin@test.com', 'admin', null);
        $this->managerA = $this->makeUser('gerentea@test.com', 'gerente', $this->storeA->id);
        $this->managerB = $this->makeUser('gerenteb@test.com', 'gerente', $this->storeB->id);
        $this->cashierA = $this->makeUser('cajeroa@test.com', 'cajero', $this->storeA->id);
    }

    private function makeUser(string $email, string $role, ?int $storeId): User
    {
        $user = User::create([
            'name' => $email,
            'email' => $email,
            'password' => bcrypt('password'),
            'company_id' => $this->company->id,
            'store_id' => $storeId,
            'active' => true,
        ]);
        $roleId = DB::table('roles')->where('name', $role)->value('id')
            ?? DB::table('roles')->insertGetId([
                'name' => $role,
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

    private function transferPayload(int $fromWhId, int $toWhId): array
    {
        return [
            'from_warehouse_id' => $fromWhId,
            'to_warehouse_id'   => $toWhId,
            'items' => [['product_id' => $this->product->id, 'quantity' => 1]],
        ];
    }

    public function test_gerente_puede_solicitar_desde_bodega_de_otra_tienda_hacia_la_suya(): void
    {
        $this->actingAs($this->managerA)
            ->postJson('/api/v1/transfers', $this->transferPayload($this->whB->id, $this->whA->id))
            ->assertCreated();
    }

    public function test_gerente_no_puede_crear_traslado_entre_tiendas_ajenas(): void
    {
        $storeC = Store::create(['company_id' => $this->company->id, 'name' => 'Tienda C', 'active' => true]);
        $whC = Warehouse::create(['company_id' => $this->company->id, 'store_id' => $storeC->id, 'name' => 'Bodega C', 'type' => 'store', 'active' => true]);

        $this->actingAs($this->managerA)
            ->postJson('/api/v1/transfers', $this->transferPayload($this->whB->id, $whC->id))
            ->assertForbidden();
    }

    public function test_cajero_no_puede_crear_traslados(): void
    {
        $this->actingAs($this->cashierA)
            ->postJson('/api/v1/transfers', $this->transferPayload($this->whA->id, $this->whB->id))
            ->assertForbidden();
    }

    public function test_solo_admin_completa_traslados(): void
    {
        $transfer = $this->createPendingTransfer($this->managerA);

        // Gerente de la tienda destino NO puede completar (aunque tiene acceso).
        $this->actingAs($this->managerA)
            ->putJson("/api/v1/transfers/{$transfer->id}/complete")
            ->assertForbidden();

        $this->actingAs($this->admin)
            ->putJson("/api/v1/transfers/{$transfer->id}/complete")
            ->assertOk();
    }

    public function test_cancela_admin_o_gerente_creador(): void
    {
        // El gerente B (de la tienda origen, NO creador) no puede cancelar.
        $transfer = $this->createPendingTransfer($this->managerA);
        $this->actingAs($this->managerB)
            ->putJson("/api/v1/transfers/{$transfer->id}/cancel")
            ->assertForbidden();

        // El gerente creador sí.
        $this->actingAs($this->managerA)
            ->putJson("/api/v1/transfers/{$transfer->id}/cancel")
            ->assertOk();

        // Admin también (sobre una solicitud nueva).
        $transfer2 = $this->createPendingTransfer($this->managerA);
        $this->actingAs($this->admin)
            ->putJson("/api/v1/transfers/{$transfer2->id}/cancel")
            ->assertOk();
    }

    private function createPendingTransfer(User $creator): Transfer
    {
        $res = $this->actingAs($creator)
            ->postJson('/api/v1/transfers', $this->transferPayload($this->whB->id, $this->whA->id))
            ->assertCreated();

        return Transfer::findOrFail($res->json('data.id'));
    }
}
