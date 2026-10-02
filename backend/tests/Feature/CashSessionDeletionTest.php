<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\CashMovement;
use App\Models\CashRegister;
use App\Models\CashRegisterSession;
use App\Models\Company;
use App\Models\Customer;
use App\Models\Inventory;
use App\Models\Payment;
use App\Models\PaymentMethod;
use App\Models\PreSaleOrder;
use App\Models\PreSaleOrderPayment;
use App\Models\Product;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\Store;
use App\Models\Supply;
use App\Models\SupplyMovement;
use App\Models\SystemLog;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * "Borrar corte" (solo admin, 2026-10-01): limpiar cortes de prueba en prod con
 * todo lo suyo — ventas (el stock regresa), folios de preventa, movimientos de
 * caja e insumos — sin mover otros cortes.
 */
class CashSessionDeletionTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;
    private Store $store;
    private Warehouse $warehouse;
    private User $admin;
    private User $gerente;
    private User $cajero;
    private CashRegisterSession $session;
    private PaymentMethod $cash;
    private Product $product;

    protected function setUp(): void
    {
        parent::setUp();

        $this->company   = Company::create(['name' => 'Tadaima Test']);
        $this->store     = Store::create(['company_id' => $this->company->id, 'name' => 'Tadaima Test #2', 'active' => true]);
        $this->warehouse = Warehouse::create([
            'company_id' => $this->company->id, 'store_id' => $this->store->id,
            'name' => 'Exhibición', 'type' => 'store', 'active' => true,
        ]);
        $this->admin   = $this->makeUser('admin@test.com', 'admin', null);
        $this->gerente = $this->makeUser('gerente@test.com', 'gerente', $this->store->id);
        $this->cajero  = $this->makeUser('cajero@test.com', 'cajero', $this->store->id);
        $this->session = $this->openSession($this->cajero, now()->subHour());
        $this->cash    = PaymentMethod::create(['name' => 'Efectivo', 'active' => true]);

        $this->product = Product::create([
            'company_id' => $this->company->id, 'name' => 'Tomo 1', 'sku' => 'TOMO-1', 'active' => true,
        ]);
        $this->product->price()->create(['price_1' => 100.0]);
        Inventory::create(['product_id' => $this->product->id, 'warehouse_id' => $this->warehouse->id, 'quantity' => 10]);
    }

    private function makeUser(string $email, string $role, ?int $storeId): User
    {
        $user = User::create([
            'name' => $email, 'email' => $email, 'password' => bcrypt('password'),
            'company_id' => $this->company->id, 'store_id' => $storeId, 'active' => true,
        ]);
        $roleId = DB::table('roles')->where('name', $role)->value('id')
            ?? DB::table('roles')->insertGetId(['name' => $role, 'guard_name' => 'api', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('model_has_roles')->insert(['role_id' => $roleId, 'model_type' => User::class, 'model_id' => $user->id]);

        return $user;
    }

    private function openSession(User $user, \DateTimeInterface $openedAt): CashRegisterSession
    {
        $register = CashRegister::create(['store_id' => $this->store->id, 'name' => 'Caja ' . $user->id . '-' . uniqid(), 'active' => true]);

        return CashRegisterSession::create([
            'register_id' => $register->id, 'user_id' => $user->id,
            'opening_cash' => 100, 'status' => 'open', 'opened_at' => $openedAt,
        ]);
    }

    private function sell(int $qty, ?CashRegisterSession $session = null, ?User $as = null): Sale
    {
        $session ??= $this->session;
        $id = $this->actingAs($as ?? $this->cajero)->postJson('/api/v1/sales', [
            'store_id' => $this->store->id, 'register_session_id' => $session->id,
            'items' => [['product_id' => $this->product->id, 'quantity' => $qty, 'price' => 100.0]],
            'payments' => [['payment_method_id' => $this->cash->id, 'amount' => 100.0 * $qty]],
        ])->assertCreated()->json('data.id');

        return Sale::findOrFail($id);
    }

    private function stock(): float
    {
        return (float) Inventory::where('product_id', $this->product->id)->where('warehouse_id', $this->warehouse->id)->value('quantity');
    }

    private function folio(string $code, array $paymentTimes): PreSaleOrder
    {
        $customer = Customer::create(['name' => 'Cliente ' . $code]);
        $order = PreSaleOrder::create([
            'code' => $code, 'store_id' => $this->store->id, 'customer_id' => $customer->id,
            'user_id' => $this->cajero->id, 'status' => PreSaleOrder::STATUS_PENDING,
        ]);
        foreach ($paymentTimes as $time) {
            $p = new PreSaleOrderPayment([
                'pre_sale_order_id' => $order->id, 'amount' => 50,
                'payment_method_id' => $this->cash->id, 'cashier_id' => $this->cajero->id,
            ]);
            $p->created_at = $time;
            $p->save();
        }

        return $order;
    }

    private function supplyFromDrawer(): SupplyMovement
    {
        $supply   = Supply::create(['company_id' => $this->company->id, 'store_id' => $this->store->id, 'name' => 'Cinta', 'category' => 'Empaque', 'unit' => 'rollo']);
        $movement = CashMovement::create(['register_session_id' => $this->session->id, 'type' => 'salida', 'amount' => 30, 'description' => 'Insumo']);

        return SupplyMovement::create([
            'supply_id' => $supply->id, 'type' => 'purchase', 'quantity' => 1, 'amount' => 30,
            'money_source' => 'caja', 'register_session_id' => $this->session->id,
            'cash_movement_id' => $movement->id, 'user_id' => $this->cajero->id,
        ]);
    }

    /** @return array<string, mixed> */
    private function preview(): array
    {
        return $this->actingAs($this->admin)->getJson("/api/v1/cash/sessions/{$this->session->id}/delete-preview")
            ->assertOk()->json('data');
    }

    /** Borra mandando los conteos del preview (lo que el admin vio). */
    private function deleteSession(?string $confirm = 'BORRAR', ?User $as = null, ?array $expected = null, bool $ack = false)
    {
        $expected ??= ($as === null || $as->isAdminRole()) ? $this->preview()['counts'] : ['sales' => 0, 'presales' => 0, 'movements' => 0, 'supplies' => 0];

        return $this->actingAs($as ?? $this->admin)->deleteJson("/api/v1/cash/sessions/{$this->session->id}", [
            'confirm' => $confirm, 'expected' => $expected, 'acknowledge_cross' => $ack,
        ]);
    }

    public function test_solo_el_admin_ve_y_borra(): void
    {
        foreach ([$this->gerente, $this->cajero] as $user) {
            $this->actingAs($user)->getJson("/api/v1/cash/sessions/{$this->session->id}/delete-preview")->assertStatus(403);
            $this->deleteSession('BORRAR', $user)->assertStatus(403);
        }
        $this->assertNotNull($this->session->fresh());
    }

    public function test_el_preview_muestra_todo_lo_que_se_borra(): void
    {
        $sale = $this->sell(2);
        $this->supplyFromDrawer();
        $this->folio('PREV-1', [now()->subMinutes(10)]);

        $data = $this->actingAs($this->admin)->getJson("/api/v1/cash/sessions/{$this->session->id}/delete-preview")
            ->assertOk()->json('data');

        $this->assertSame($this->session->id, $data['session']['id']);
        $this->assertSame([$sale->id], array_column($data['sales'], 'id'));
        $this->assertEquals(2.0, $data['stock'][0]['quantity']);
        $this->assertSame('Exhibición', $data['stock'][0]['warehouse']);
        $this->assertSame(['PREV-1'], array_column($data['presales'], 'code'));
        $this->assertCount(1, $data['movements']);
        $this->assertCount(1, $data['supplies']);
        $this->assertSame([], $data['blockers']);
        $this->assertNotEmpty($data['warnings']); // sigue abierto
    }

    public function test_hay_que_escribir_borrar(): void
    {
        $this->sell(1);
        $this->deleteSession(null)->assertStatus(422);
        $this->deleteSession('borrar')->assertStatus(422);
        $this->assertNotNull($this->session->fresh());
        $this->assertSame(1, Sale::count());
    }

    public function test_borra_todo_y_regresa_el_stock_neto(): void
    {
        $sale = $this->sell(3);                       // stock 10 → 7
        $itemId = SaleItem::where('sale_id', $sale->id)->value('id');
        $this->actingAs($this->cajero)->postJson("/api/v1/sales/{$sale->id}/cancel", [
            'reason_code' => 'otro', 'cash_session_id' => $this->session->id,
            'items' => [['sale_item_id' => $itemId, 'quantity' => 1]],
        ])->assertOk();                               // stock 8, venta queda con 2
        $this->supplyFromDrawer();
        $this->folio('PREV-2', [now()->subMinutes(5)]);

        // Otro corte de la misma tienda: no se toca.
        $otroCajero = $this->makeUser('otro@test.com', 'cajero', $this->store->id);
        $otro       = $this->openSession($otroCajero, now()->subMinutes(30));
        $otraVenta  = $this->sell(1, $otro, $otroCajero); // stock 7

        $this->deleteSession()->assertOk();

        $this->assertNull($this->session->fresh());
        $this->assertNull(Sale::find($sale->id));
        $this->assertSame(0, SaleItem::where('sale_id', $sale->id)->count());
        $this->assertSame(0, Payment::where('sale_id', $sale->id)->count());
        $this->assertSame(0, CashMovement::where('register_session_id', $this->session->id)->count());
        $this->assertSame(0, SupplyMovement::count());
        $this->assertNull(PreSaleOrder::where('code', 'PREV-2')->first());
        $this->assertSame(0, DB::table('sale_cancellations')->count());
        // Regresan las 2 que seguían vendidas (no las 3): 7 + 2 = 9.
        $this->assertEquals(9.0, $this->stock());
        $this->assertNotNull(Sale::find($otraVenta->id));
        $this->assertNotNull($otro->fresh());

        $log = SystemLog::where('action', 'cash_session.deleted')->sole();
        $this->assertSame($this->session->id, (int) $log->entity_id);
        $this->assertSame([$sale->id], array_column($log->meta['preview']['sales'], 'id'));
        // Respaldo con renglones completos (líneas y pagos).
        $this->assertSame($sale->id, $log->meta['archive']['sales'][0]['id']);
        $this->assertNotEmpty($log->meta['archive']['sales'][0]['payments']);
        $this->assertDatabaseHas('inventory_movements', [
            'reference' => "BORRADO-CORTE-{$this->session->id}", 'type' => 'devolucion', 'quantity' => 2,
        ]);
    }

    public function test_venta_devuelta_con_el_return_viejo_no_regresa_doble(): void
    {
        $sale = $this->sell(2);                       // 10 → 8
        $this->actingAs($this->cajero)->postJson("/api/v1/sales/{$sale->id}/return")->assertOk(); // → 10

        $this->deleteSession()->assertOk();
        $this->assertEquals(10.0, $this->stock());
    }

    public function test_la_devolucion_hecha_en_otro_corte_se_queda_alla(): void
    {
        $sale  = $this->sell(1);
        $other = $this->openSession($this->admin, now()->subMinutes(20));
        $this->actingAs($this->admin)->postJson("/api/v1/sales/{$sale->id}/cancel", [
            'reason_code' => 'otro', 'cash_session_id' => $other->id,
        ])->assertOk();

        $cross = $this->preview()['cross'];
        $this->assertTrue(collect($cross)->contains(fn ($w) => str_contains($w, "#{$other->id}")));

        // Mueve otro corte: sin confirmarlo explícitamente no se borra.
        $this->deleteSession()->assertStatus(422);
        $this->assertNotNull($this->session->fresh());

        $this->deleteSession(ack: true)->assertOk();
        $this->assertSame(1, CashMovement::where('register_session_id', $other->id)->where('type', 'salida')->count());
    }

    public function test_folio_con_cobros_en_otro_corte_bloquea(): void
    {
        $sale = $this->sell(1);
        $this->folio('PREV-3', [now()->subMinutes(10), now()->subDays(2)]);

        $this->deleteSession()->assertStatus(422);
        $this->assertNotNull($this->session->fresh());
        $this->assertNotNull(Sale::find($sale->id));
        $this->assertNotNull(PreSaleOrder::where('code', 'PREV-3')->first());
        $this->assertSame(0, SystemLog::where('action', 'cash_session.deleted')->count());
    }

    public function test_corte_cerrado_tambien_se_borra(): void
    {
        $sale = $this->sell(1);
        $this->session->update(['status' => 'closed', 'closed_at' => now(), 'closing_cash' => 200]);

        $this->deleteSession()->assertOk();
        $this->assertNull(Sale::find($sale->id));
        $this->assertEquals(10.0, $this->stock());
    }

    public function test_el_fondo_inicial_tiene_tope(): void
    {
        $nuevo = $this->makeUser('nuevo@test.com', 'cajero', $this->store->id);
        $this->actingAs($nuevo)->postJson('/api/v1/cash/open', [
            'store_id' => $this->store->id, 'opening_cash' => 6632262600,
        ])->assertStatus(422);
    }

    public function test_la_devolucion_de_otro_corte_registrada_aqui_pide_confirmacion(): void
    {
        $otroCajero = $this->makeUser('otro2@test.com', 'cajero', $this->store->id);
        $otro       = $this->openSession($otroCajero, now()->subMinutes(40));
        $ajena      = $this->sell(1, $otro, $otroCajero);
        // El cajero de ESTE corte cancela la venta ajena: la salida cae aquí.
        $this->actingAs($this->cajero)->postJson("/api/v1/sales/{$ajena->id}/cancel", [
            'reason_code' => 'otro', 'cash_session_id' => $this->session->id,
        ])->assertOk();

        $this->assertNotEmpty($this->preview()['cross']);
        $this->deleteSession()->assertStatus(422);
        $this->deleteSession(ack: true)->assertOk();
        $this->assertNotNull(Sale::find($ajena->id)); // la venta del otro corte no se borra
    }

    public function test_folio_creado_en_otro_momento_bloquea(): void
    {
        $order = $this->folio('PREV-VIEJO', [now()->subMinutes(5)]);
        $order->forceFill(['created_at' => now()->subDays(10)])->save();

        $this->assertNotEmpty($this->preview()['blockers']);
        $this->deleteSession()->assertStatus(422);
        $this->assertNotNull(PreSaleOrder::where('code', 'PREV-VIEJO')->first());
    }

    public function test_si_el_corte_cambio_mientras_se_revisaba_no_se_borra(): void
    {
        $this->sell(1);
        $vistos = $this->preview()['counts'];
        $nueva  = $this->sell(1); // entra otra venta mientras el admin revisa

        $this->deleteSession(expected: $vistos)->assertStatus(422);
        $this->assertNotNull(Sale::find($nueva->id));
        $this->assertNotNull($this->session->fresh());
    }

    public function test_linea_de_producto_borrado_no_regresa_stock_pero_se_borra(): void
    {
        $sale = $this->sell(1);
        SaleItem::where('sale_id', $sale->id)->update(['product_id' => null]);

        $this->assertSame([], $this->preview()['stock']);
        $this->deleteSession()->assertOk();
        $this->assertNull(Sale::find($sale->id));
        $this->assertEquals(9.0, $this->stock());
    }
}
