<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\CashRegister;
use App\Models\CashRegisterSession;
use App\Models\Company;
use App\Models\Customer;
use App\Models\PaymentMethod;
use App\Models\PreSaleCatalog;
use App\Models\PreSaleDelivery;
use App\Models\PreSaleOrder;
use App\Models\PreSaleOrderItem;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * Una preventa se recoge solo en la tienda donde se apartó (regla de Pier,
 * 2026-11-18). Cajero y gerente ya estaban limitados a su tienda (403); estas
 * pruebas cierran el caso del admin, que puede operar en cualquiera.
 */
class PreSalePickupStoreTest extends TestCase
{
    use RefreshDatabase;

    private Store $macro;
    private Store $centro;
    private User $admin;
    private User $cajeroCentro;
    private PaymentMethod $cash;
    private PreSaleOrder $order;
    private PreSaleOrderItem $item;

    protected function setUp(): void
    {
        parent::setUp();

        $company      = Company::create(['name' => 'Test Co']);
        $this->macro  = Store::create(['company_id' => $company->id, 'name' => 'Macro']);
        $this->centro = Store::create(['company_id' => $company->id, 'name' => 'Centro']);
        $this->cash   = PaymentMethod::create([
            'name' => 'Efectivo', 'allow_cash' => true, 'allow_card' => false, 'active' => true,
        ]);

        $this->admin = User::create([
            'name' => 'Admin', 'email' => 'admin@test.com', 'password' => bcrypt('x'),
            'company_id' => $company->id, 'store_id' => $this->macro->id,
        ]);
        $roleId = DB::table('roles')->insertGetId([
            'name' => 'admin', 'guard_name' => 'api', 'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('model_has_roles')->insert([
            'role_id' => $roleId, 'model_type' => User::class, 'model_id' => $this->admin->id,
        ]);
        $this->cajeroCentro = User::create([
            'name' => 'Cajero Centro', 'email' => 'centro@test.com', 'password' => bcrypt('x'),
            'company_id' => $company->id, 'store_id' => $this->centro->id,
        ]);

        // Folio LISTO apartado en Macro: $700 con $300 de anticipo.
        $catalog = PreSaleCatalog::create([
            'product_name' => 'Booster Bundle', 'price_1' => 700, 'cost' => 400,
            'status' => PreSaleCatalog::STATUS_ARRIVED, 'created_by' => $this->admin->id,
        ]);
        $this->order = PreSaleOrder::create([
            'code' => 'PREV-MACRO', 'store_id' => $this->macro->id, 'user_id' => $this->admin->id,
            'customer_id' => Customer::create(['name' => 'Ana Torres'])->id,
            'status' => PreSaleOrder::STATUS_READY,
        ]);
        $this->item = $this->order->items()->create([
            'pre_sale_catalog_id' => $catalog->id, 'quantity' => 1, 'price_level' => 1,
            'unit_price' => 700, 'cost' => 400, 'status' => PreSaleOrderItem::STATUS_PENDING,
        ]);
        $this->order->payments()->create([
            'amount' => 300, 'payment_method_id' => $this->cash->id,
            'cashier_id' => $this->admin->id, 'notes' => 'Anticipo inicial',
        ]);
    }

    private function openCash(User $user, Store $store): CashRegisterSession
    {
        $register = CashRegister::create(['store_id' => $store->id, 'name' => 'Caja ' . $store->name, 'active' => true]);

        return CashRegisterSession::create([
            'register_id' => $register->id, 'user_id' => $user->id,
            'opening_cash' => 0, 'opened_at' => now()->subHour(), 'status' => 'open',
        ]);
    }

    private function chargeAt(Store $store, CashRegisterSession $session, User $user): TestResponse
    {
        return $this->actingAs($user)->postJson('/api/v1/sales/mixed', [
            'store_id'            => $store->id,
            'register_session_id' => $session->id,
            'customer_id'         => $this->order->customer_id,
            'liquidation'         => [
                'pre_sale_order_id' => $this->order->id,
                'item_ids'          => [$this->item->id],
                'payment'           => ['amount' => 400, 'payment_method_id' => $this->cash->id],
            ],
        ]);
    }

    private function deliverByStatus(): TestResponse
    {
        return $this->actingAs($this->admin)->patchJson("/api/v1/pre-sale-orders/{$this->order->id}/status", [
            'status' => 'delivered',
        ]);
    }

    private function assertWrongStore(TestResponse $res): void
    {
        $res->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath('errors.code.0', PreSaleOrder::ERROR_WRONG_PICKUP_STORE);
        $this->assertStringContainsString('Macro', (string) $res->json('error'));
    }

    private function assertNotDelivered(): void
    {
        $this->assertSame(PreSaleOrder::STATUS_READY, $this->order->refresh()->status);
        $this->assertSame(PreSaleOrderItem::STATUS_PENDING, $this->item->refresh()->status);
        $this->assertSame(0, PreSaleDelivery::count());
        $this->assertSame(1, $this->order->payments()->count(), 'solo el anticipo');
    }

    public function test_admin_no_cobra_en_centro_un_folio_de_macro(): void
    {
        $session = $this->openCash($this->admin, $this->centro);

        $this->assertWrongStore($this->chargeAt($this->centro, $session, $this->admin));
        $this->assertNotDelivered();
    }

    public function test_admin_si_cobra_el_folio_en_su_tienda(): void
    {
        $session = $this->openCash($this->admin, $this->macro);

        $this->chargeAt($this->macro, $session, $this->admin)->assertStatus(201);
        $this->assertSame(PreSaleOrder::STATUS_DELIVERED, $this->order->refresh()->status);
    }

    public function test_cajero_de_otra_tienda_sigue_en_403(): void
    {
        $session = $this->openCash($this->cajeroCentro, $this->centro);

        $this->chargeAt($this->centro, $session, $this->cajeroCentro)->assertStatus(403);
        $this->assertNotDelivered();
    }

    public function test_admin_con_caja_en_otra_tienda_no_entrega_por_status(): void
    {
        $this->openCash($this->admin, $this->centro);

        $this->assertWrongStore($this->deliverByStatus());
        $this->assertNotDelivered();
    }

    public function test_admin_con_caja_en_otra_tienda_no_entrega_la_partida(): void
    {
        $this->openCash($this->admin, $this->centro);

        $res = $this->actingAs($this->admin)
            ->patchJson("/api/v1/pre-sale-orders/{$this->order->id}/items/{$this->item->id}/deliver", ['status' => 'delivered']);

        $this->assertWrongStore($res);
        $this->assertSame(PreSaleOrderItem::STATUS_PENDING, $this->item->refresh()->status);
    }

    public function test_admin_con_caja_en_la_tienda_del_folio_entrega_por_status(): void
    {
        $this->openCash($this->admin, $this->macro);

        $this->deliverByStatus()->assertStatus(200);
        $this->assertSame(PreSaleOrder::STATUS_DELIVERED, $this->order->refresh()->status);
    }

    public function test_admin_sin_caja_abierta_entrega_por_status(): void
    {
        // Sin caja no hay tienda contra la cual comparar: no está en mostrador.
        $this->deliverByStatus()->assertStatus(200);
    }

    public function test_marcar_listo_no_depende_de_la_caja_del_admin(): void
    {
        $this->order->update(['status' => PreSaleOrder::STATUS_PENDING]);
        $this->openCash($this->admin, $this->centro);

        $this->actingAs($this->admin)
            ->patchJson("/api/v1/pre-sale-orders/{$this->order->id}/status", ['status' => 'ready'])
            ->assertStatus(200);
    }
}
