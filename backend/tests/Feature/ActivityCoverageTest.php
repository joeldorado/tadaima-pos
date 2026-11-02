<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Customer;
use App\Models\PaymentMethod;
use App\Models\Product;
use App\Models\ProductPromotion;
use App\Models\Store;
use App\Models\Supplier;
use App\Models\Terminal;
use App\Models\User;
use App\Models\Warehouse;
use App\Support\ActivityGroups;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Cobertura de auditoría (2026-11-02): promos, usuarios y roles, clientes,
 * tiendas/bodegas/terminales/métodos de pago, proveedores e insumos, catálogo
 * online y caja dejan rastro en `system_logs` vía `App\Support\ModelAudit`.
 * Un PUT sin cambio real no escribe nada, y nunca se guarda una contraseña.
 */
class ActivityCoverageTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private Store $store;
    private Warehouse $exh;

    protected function setUp(): void
    {
        parent::setUp();

        $company     = Company::create(['name' => 'Test Company']);
        $this->store = Store::create(['company_id' => $company->id, 'name' => 'Centro']);
        $this->exh   = Warehouse::create(['company_id' => $company->id, 'store_id' => $this->store->id, 'name' => 'Centro', 'type' => 'store', 'active' => true]);
        $this->admin = User::create([
            'name' => 'Admin', 'email' => 'admin@test.com', 'password' => bcrypt('password'),
            'company_id' => $company->id, 'store_id' => $this->store->id, 'can_manage_promos' => true,
        ]);
        $roleId = DB::table('roles')->insertGetId(['name' => 'admin', 'guard_name' => 'api', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('model_has_roles')->insert(['role_id' => $roleId, 'model_type' => User::class, 'model_id' => $this->admin->id]);
    }

    /** @return \Illuminate\Support\Collection<int, array{row: object, meta: array|null}> */
    private function logs(string $action): \Illuminate\Support\Collection
    {
        return DB::table('system_logs')->where('action', $action)->orderBy('id')->get()
            ->map(fn ($row) => ['row' => $row, 'meta' => json_decode((string) $row->meta, true)]);
    }

    private function product(string $name = 'Figura', float $price = 100): Product
    {
        $p = Product::create(['name' => $name, 'sku' => strtoupper(substr(md5($name), 0, 8)), 'cost' => 50]);
        $p->price()->create(['price_1' => $price]);

        return $p;
    }

    public function test_todas_las_actions_nuevas_tienen_titulo_y_grupo_conocido(): void
    {
        foreach (ActivityGroups::LOG_ACTIONS as $action => [$group, $title]) {
            $this->assertContains($group, ActivityGroups::GROUPS, "{$action} apunta al grupo desconocido {$group}");
            $this->assertNotSame('', $title);
        }
        $this->assertSame('promo', ActivityGroups::logGroup('promo.created'));
        $this->assertSame('usuario', ActivityGroups::logGroup('user.role_assigned'));
        $this->assertSame('Promoción editada: lleva N', ActivityGroups::logTitle('promo.updated', ['changes' => ['buy_n' => ['from' => 2, 'to' => 3]]]));
    }

    public function test_promo_crear_editar_asignar_y_borrar(): void
    {
        $this->actingAs($this->admin)->postJson('/api/v1/promotions', ['name' => '3x2 Mangas', 'type' => 'nxm', 'buy_n' => 3, 'pay_m' => 2])->assertStatus(201);
        $promo = ProductPromotion::firstOrFail();
        $this->assertCount(1, $this->logs('promo.created'));
        $this->assertSame(3, $this->logs('promo.created')[0]['meta']['values']['buy_n']);

        $this->actingAs($this->admin)->putJson("/api/v1/promotions/{$promo->id}", ['name' => '3x2 Mangas', 'buy_n' => 3, 'pay_m' => 2])->assertOk();
        $this->assertCount(0, $this->logs('promo.updated'), 'sin cambio real no hay log');

        $this->actingAs($this->admin)->putJson("/api/v1/promotions/{$promo->id}", ['name' => '3x2 Mangas', 'buy_n' => 4, 'pay_m' => 3])->assertOk();
        $meta = $this->logs('promo.updated')[0]['meta'];
        $this->assertSame(['from' => 3, 'to' => 4], $meta['changes']['buy_n']);
        $this->assertSame(['from' => 2, 'to' => 3], $meta['changes']['pay_m']);

        $p = $this->product();
        $this->actingAs($this->admin)->postJson("/api/v1/promotions/{$promo->id}/products", ['product_ids' => [$p->id]])->assertOk();
        $this->assertSame([$p->id], $this->logs('promo.products_attached')[0]['meta']['product_ids']);

        $this->actingAs($this->admin)->deleteJson("/api/v1/promotions/{$promo->id}/products/{$p->id}")->assertOk();
        $this->assertCount(1, $this->logs('promo.products_detached'));

        $this->actingAs($this->admin)->deleteJson("/api/v1/promotions/{$promo->id}")->assertOk();
        $this->assertSame('3x2 Mangas', $this->logs('promo.deleted')[0]['meta']['snapshot']['name']);
    }

    public function test_usuario_crear_editar_rol_y_desactivar_sin_guardar_password(): void
    {
        $cajeroRole = DB::table('roles')->insertGetId(['name' => 'cajero', 'guard_name' => 'api', 'created_at' => now(), 'updated_at' => now()]);
        $gerenteRole = DB::table('roles')->insertGetId(['name' => 'gerente', 'guard_name' => 'api', 'created_at' => now(), 'updated_at' => now()]);

        $this->actingAs($this->admin)->postJson('/api/v1/users', [
            'name' => 'Pier', 'email' => 'pier@test.com', 'password' => 'secreto-123', 'password_confirmation' => 'secreto-123',
            'store_id' => $this->store->id, 'role_id' => $cajeroRole,
        ])->assertStatus(201);
        $user = User::where('email', 'pier@test.com')->firstOrFail();
        $created = $this->logs('user.created')[0];
        $this->assertSame($this->admin->id, (int) $created['row']->user_id);
        $this->assertSame($cajeroRole, $created['meta']['role_id']);
        $this->assertStringNotContainsString('secreto', json_encode($created['meta']));

        $this->actingAs($this->admin)->putJson("/api/v1/users/{$user->id}", ['can_view_cost' => true, 'password' => 'otra-clave-456', 'password_confirmation' => 'otra-clave-456'])->assertOk();
        $updated = $this->logs('user.updated')[0]['meta'];
        $this->assertTrue($updated['changes']['can_view_cost']['to']);
        $this->assertTrue($updated['password_changed']);
        $this->assertStringNotContainsString('otra-clave', json_encode($updated));

        $this->actingAs($this->admin)->postJson("/api/v1/users/{$user->id}/roles", ['role_id' => $gerenteRole])->assertOk();
        $role = $this->logs('user.role_assigned')[0]['meta'];
        $this->assertSame(['cajero'], $role['from']);
        $this->assertSame(['gerente'], $role['to']);

        $this->actingAs($this->admin)->deleteJson("/api/v1/users/{$user->id}")->assertOk();
        $this->assertCount(1, $this->logs('user.deactivated'));
    }

    public function test_cliente_crear_editar_credito_y_borrar(): void
    {
        $this->actingAs($this->admin)->postJson('/api/v1/customers', ['name' => 'Ana', 'phone' => '6641234567'])->assertStatus(201);
        $customer = Customer::firstOrFail();
        $this->assertCount(1, $this->logs('customer.created'));

        $this->actingAs($this->admin)->putJson("/api/v1/customers/{$customer->id}", ['name' => 'Ana', 'phone' => '6641234567'])->assertOk();
        $this->assertCount(0, $this->logs('customer.updated'));

        $this->actingAs($this->admin)->putJson("/api/v1/customers/{$customer->id}", ['phone' => '6649999999'])->assertOk();
        $this->assertSame('6649999999', $this->logs('customer.updated')[0]['meta']['changes']['phone']['to']);

        $this->actingAs($this->admin)->postJson("/api/v1/customers/{$customer->id}/credit", ['amount' => 150, 'reason' => 'Devolución'])->assertStatus(201);
        $this->assertSame(150.0, (float) $this->logs('customer.credit_added')[0]['meta']['amount']);

        $this->actingAs($this->admin)->deleteJson("/api/v1/customers/{$customer->id}")->assertOk();
        $this->assertSame('Ana', $this->logs('customer.deleted')[0]['meta']['snapshot']['name']);
    }

    public function test_configuracion_tienda_bodega_terminal_metodo_y_proveedor(): void
    {
        $this->actingAs($this->admin)->putJson("/api/v1/stores/{$this->store->id}", ['name' => 'Centro', 'phone' => '6640000000'])->assertOk();
        $this->assertSame('6640000000', $this->logs('store.updated')[0]['meta']['changes']['phone']['to']);

        $this->actingAs($this->admin)->postJson('/api/v1/warehouses', ['name' => 'Bodega 2', 'store_id' => $this->store->id, 'type' => 'bodega'])->assertStatus(201);
        $this->assertCount(1, $this->logs('warehouse.created'));

        $this->actingAs($this->admin)->postJson('/api/v1/terminals', ['name' => 'BBVA', 'store_id' => $this->store->id, 'commission_percent' => 3.5])->assertStatus(201);
        $terminal = Terminal::firstOrFail();
        $this->actingAs($this->admin)->putJson("/api/v1/terminals/{$terminal->id}", ['commission_percent' => 4.0])->assertOk();
        $this->assertEquals(['from' => 3.5, 'to' => 4], $this->logs('terminal.updated')[0]['meta']['changes']['commission_percent']);

        $this->actingAs($this->admin)->postJson('/api/v1/payment-methods', ['name' => 'Vales'])->assertStatus(201);
        $this->assertCount(1, $this->logs('payment_method.created'));
        $method = PaymentMethod::where('name', 'Vales')->firstOrFail();
        $this->actingAs($this->admin)->postJson("/api/v1/stores/{$this->store->id}/payment-methods", ['payment_method_id' => $method->id])->assertOk();
        $this->assertSame($method->id, $this->logs('store.payment_method_assigned')[0]['meta']['payment_method_id']);

        $this->actingAs($this->admin)->postJson('/api/v1/suppliers', ['name' => 'Panini'])->assertStatus(201);
        $supplier = Supplier::firstOrFail();
        $this->actingAs($this->admin)->deleteJson("/api/v1/suppliers/{$supplier->id}")->assertOk();
        $this->assertCount(1, $this->logs('supplier.created'));
        $this->assertCount(1, $this->logs('supplier.deleted'));
    }

    public function test_caja_abrir_movimiento_y_cerrar(): void
    {
        $this->actingAs($this->admin)->postJson('/api/v1/cash/open', ['opening_cash' => 500, 'store_id' => $this->store->id])->assertStatus(201);
        $this->assertSame(500.0, (float) $this->logs('cash_session.opened')[0]['meta']['opening_cash']);

        $this->actingAs($this->admin)->postJson('/api/v1/cash/movements', ['type' => 'salida', 'amount' => 120, 'description' => 'Hielo'])->assertStatus(201);
        $this->assertSame('Hielo', $this->logs('cash_movement.created')[0]['meta']['description']);

        $this->actingAs($this->admin)->postJson('/api/v1/cash/close', ['closing_cash' => 380])->assertOk();
        $this->assertSame(380.0, (float) $this->logs('cash_session.closed')[0]['meta']['closing_cash']);
    }

    public function test_catalogo_online_visibilidad_y_destacados(): void
    {
        $p = $this->product('Tomo 1');
        $this->actingAs($this->admin)->postJson("/api/v1/catalog/products/{$this->store->id}", ['product_id' => $p->id])->assertStatus(201);
        $this->assertCount(1, $this->logs('catalog.product_added'));

        $this->actingAs($this->admin)->putJson("/api/v1/catalog/products/{$this->store->id}/{$p->id}", ['visible' => true])->assertOk();
        $this->assertCount(0, $this->logs('catalog.product_visibility'), 'ya era visible: sin log');
        $this->actingAs($this->admin)->putJson("/api/v1/catalog/products/{$this->store->id}/{$p->id}", ['visible' => false])->assertOk();
        $this->assertFalse($this->logs('catalog.product_visibility')[0]['meta']['visible']);

        $this->actingAs($this->admin)->deleteJson("/api/v1/catalog/products/{$this->store->id}/{$p->id}")->assertOk();
        $this->assertCount(1, $this->logs('catalog.product_removed'));
    }
}
