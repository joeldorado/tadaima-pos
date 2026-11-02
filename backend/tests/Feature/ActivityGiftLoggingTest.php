<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\CashRegister;
use App\Models\CashRegisterSession;
use App\Models\Company;
use App\Models\Inventory;
use App\Models\PaymentMethod;
use App\Models\Product;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\Store;
use App\Models\SystemLog;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Regalos en Administración → Actividad (2026-11-02): cada línea regalada deja
 * `sale.gift` con quién la dio, para filtrar por «Regalos» y por usuario. Una
 * venta normal no deja nada, y cancelar el regalo deja `sale.gift_cancelled`.
 */
class ActivityGiftLoggingTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $cajeraA;
    private User $cajeraB;
    private Store $storeA;
    private Store $storeB;
    private CashRegisterSession $sessionA;
    private CashRegisterSession $sessionB;
    private PaymentMethod $cash;
    private Product $gift;
    private Product $paid;

    protected function setUp(): void
    {
        parent::setUp();

        $company = Company::create(['name' => 'Test Co']);
        $this->storeA = Store::create(['company_id' => $company->id, 'name' => 'Centro']);
        $this->storeB = Store::create(['company_id' => $company->id, 'name' => 'Macroplaza']);
        $this->cajeraA = $this->user('Ana', 'ana@test.com', $company->id, $this->storeA->id);
        $this->cajeraB = $this->user('Bety', 'bety@test.com', $company->id, $this->storeB->id);
        $this->admin = $this->user('Admin', 'admin@test.com', $company->id, null);
        $roleId = DB::table('roles')->insertGetId(['name' => 'admin', 'guard_name' => 'api', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('model_has_roles')->insert(['role_id' => $roleId, 'model_type' => User::class, 'model_id' => $this->admin->id]);

        $whA = Warehouse::create(['company_id' => $company->id, 'store_id' => $this->storeA->id, 'name' => 'Exh A', 'type' => 'store', 'active' => true]);
        $whB = Warehouse::create(['company_id' => $company->id, 'store_id' => $this->storeB->id, 'name' => 'Exh B', 'type' => 'store', 'active' => true]);
        $this->sessionA = $this->openCash($this->storeA, $this->cajeraA);
        $this->sessionB = $this->openCash($this->storeB, $this->cajeraB);
        $this->cash = PaymentMethod::firstOrCreate(['name' => 'Efectivo'], ['active' => true]);

        $this->gift = $this->product('Cable', 150, 90, [$whA->id, $whB->id]);
        $this->paid = $this->product('Figura', 200, 100, [$whA->id, $whB->id]);
    }

    private function user(string $name, string $email, int $companyId, ?int $storeId): User
    {
        return User::create(['name' => $name, 'email' => $email, 'password' => bcrypt('x'), 'company_id' => $companyId, 'store_id' => $storeId]);
    }

    private function openCash(Store $store, User $user): CashRegisterSession
    {
        $register = CashRegister::create(['store_id' => $store->id, 'name' => "Caja {$store->name}", 'active' => true]);

        return CashRegisterSession::create(['register_id' => $register->id, 'user_id' => $user->id, 'opening_cash' => 0, 'status' => 'open', 'opened_at' => now()]);
    }

    /** @param list<int> $warehouseIds */
    private function product(string $name, float $price, float $cost, array $warehouseIds): Product
    {
        $product = Product::create(['name' => $name, 'sku' => strtoupper($name), 'cost' => $cost, 'active' => true]);
        $product->price()->create(['price_1' => $price]);
        foreach ($warehouseIds as $id) {
            Inventory::create(['product_id' => $product->id, 'warehouse_id' => $id, 'quantity' => 10]);
        }

        return $product;
    }

    private function giftSale(User $user, Store $store, CashRegisterSession $session, float $qty = 2, ?string $note = null): Sale
    {
        $res = $this->actingAs($user)->postJson('/api/v1/sales', [
            'store_id' => $store->id, 'register_session_id' => $session->id, 'calc_version' => 2,
            'items' => [['product_id' => $this->gift->id, 'quantity' => $qty, 'price' => 150, 'is_gift' => true, 'gift_note' => $note]],
            'payments' => [['payment_method_id' => $this->cash->id, 'amount' => 0]],
        ])->assertStatus(201);

        return Sale::findOrFail($res->json('data.id'));
    }

    /** @return list<array<string, mixed>> */
    private function feed(array $params = []): array
    {
        return $this->actingAs($this->admin)
            ->getJson('/api/v1/activity?'.http_build_query($params + ['group' => 'regalo']))
            ->assertOk()->json('data.data');
    }

    public function test_el_regalo_deja_log_con_quien_lo_dio_y_lo_que_valia(): void
    {
        $sale = $this->giftSale($this->cajeraA, $this->storeA, $this->sessionA, 2, 'cliente frecuente');

        $log = SystemLog::where('action', 'sale.gift')->sole();
        $this->assertSame($this->cajeraA->id, (int) $log->user_id);
        $this->assertSame('product', $log->entity_type);
        $this->assertSame($this->gift->id, (int) $log->entity_id);
        $this->assertSame($sale->id, $log->meta['sale_id']);
        $this->assertEqualsWithDelta(300.0, (float) $log->meta['value'], 0.001);
        $this->assertEqualsWithDelta(180.0, (float) $log->meta['cost_value'], 0.001);
        $this->assertSame('cliente frecuente', $log->meta['note']);
    }

    public function test_una_venta_normal_no_deja_log_de_regalo(): void
    {
        $this->actingAs($this->cajeraA)->postJson('/api/v1/sales', [
            'store_id' => $this->storeA->id, 'register_session_id' => $this->sessionA->id, 'calc_version' => 2,
            'items' => [['product_id' => $this->paid->id, 'quantity' => 1, 'price' => 200]],
            'payments' => [['payment_method_id' => $this->cash->id, 'amount' => 200]],
        ])->assertStatus(201);

        $this->assertSame(0, SystemLog::whereIn('action', ['sale.gift', 'sale.gift_cancelled'])->count());
    }

    public function test_el_filtro_regalo_solo_trae_regalos_con_usuario_titulo_y_tienda(): void
    {
        $this->giftSale($this->cajeraA, $this->storeA, $this->sessionA);

        $events = $this->feed();

        // El movimiento `venta` de la misma pieza no entra al filtro de regalos.
        $this->assertCount(1, $events);
        $this->assertSame('sale.gift', $events[0]['action']);
        $this->assertSame('regalo', $events[0]['group']);
        $this->assertSame('Regalo', $events[0]['title']);
        $this->assertSame('Ana', $events[0]['user']['name']);
        $this->assertSame('Centro', $events[0]['store']['name']);
        $this->assertSame($this->gift->id, $events[0]['product']['id']);
    }

    public function test_se_filtra_por_quien_dio_el_regalo(): void
    {
        $this->giftSale($this->cajeraA, $this->storeA, $this->sessionA);
        $this->giftSale($this->cajeraB, $this->storeB, $this->sessionB);

        $this->assertCount(2, $this->feed());
        $onlyB = $this->feed(['user_id' => $this->cajeraB->id]);
        $this->assertCount(1, $onlyB);
        $this->assertSame('Bety', $onlyB[0]['user']['name']);

        $summary = $this->actingAs($this->admin)
            ->getJson('/api/v1/activity/summary?group=regalo')->assertOk()->json('data');
        $this->assertCount(2, $summary['by_user']);
    }

    public function test_el_filtro_de_tienda_encuentra_los_regalos_de_esa_tienda(): void
    {
        $this->giftSale($this->cajeraA, $this->storeA, $this->sessionA);
        $this->giftSale($this->cajeraB, $this->storeB, $this->sessionB);

        $events = $this->feed(['store_id' => $this->storeB->id]);

        $this->assertCount(1, $events);
        $this->assertSame('Macroplaza', $events[0]['store']['name']);
    }

    public function test_el_filtro_de_producto_encuentra_el_regalo(): void
    {
        $this->giftSale($this->cajeraA, $this->storeA, $this->sessionA);

        $this->assertCount(1, $this->feed(['product_id' => $this->gift->id]));
        $this->assertCount(0, $this->feed(['product_id' => $this->paid->id]));
    }

    public function test_cancelar_el_regalo_deja_log_con_quien_cancelo(): void
    {
        $sale = $this->giftSale($this->cajeraA, $this->storeA, $this->sessionA, 2);
        $line = SaleItem::where('sale_id', $sale->id)->sole();

        $this->actingAs($this->admin)->postJson("/api/v1/sales/{$sale->id}/cancel", [
            'items' => [['sale_item_id' => $line->id, 'quantity' => 1]],
            'reason_code' => 'cliente_devuelve',
        ])->assertOk();

        $log = SystemLog::where('action', 'sale.gift_cancelled')->sole();
        $this->assertSame($this->admin->id, (int) $log->user_id);
        $this->assertEqualsWithDelta(1.0, (float) $log->meta['quantity'], 0.001);
        $this->assertEqualsWithDelta(150.0, (float) $log->meta['value'], 0.001);
    }

    public function test_la_venta_dice_quien_dio_el_regalo(): void
    {
        $res = $this->actingAs($this->cajeraA)->postJson('/api/v1/sales', [
            'store_id' => $this->storeA->id, 'register_session_id' => $this->sessionA->id, 'calc_version' => 2,
            'items' => [['product_id' => $this->gift->id, 'quantity' => 1, 'price' => 150, 'is_gift' => true]],
            'payments' => [['payment_method_id' => $this->cash->id, 'amount' => 0]],
        ])->assertStatus(201);

        $res->assertJsonPath('data.items.0.gift.given_by', 'Ana');
    }

    public function test_cajero_no_ve_actividad_de_regalos(): void
    {
        $this->actingAs($this->cajeraA)->getJson('/api/v1/activity?group=regalo')->assertStatus(403);
    }
}
