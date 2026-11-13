<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\CashMovement;
use App\Models\CashRegister;
use App\Models\CashRegisterSession;
use App\Models\Company;
use App\Models\Customer;
use App\Models\Inventory;
use App\Models\PaymentMethod;
use App\Models\PreSaleCatalog;
use App\Models\PreSaleDelivery;
use App\Models\PreSaleOrder;
use App\Models\PreSaleOrderItem;
use App\Models\PreSaleOrderLog;
use App\Models\Product;
use App\Models\SaleCancellation;
use App\Models\Store;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * Entrega parcial de preventas (2026-11-13).
 *
 * Caso de tienda: un folio con 3 productos y solo llegaron 2. El cajero elige
 * qué partidas se lleva el cliente (`item_ids`) y cobra solo lo que falta de
 * esas (`payment`), todo en UNA llamada. La pendiente conserva su anticipo.
 *
 * Invariantes:
 *  - Solo se entregan las partidas pedidas; el folio cierra al entregar la última.
 *  - pagado ≥ Σ total de partidas entregadas (±$0.01); si no, 422 y nada se guarda.
 *  - Cada entrega queda en `pre_sale_deliveries` con el pago que la liquidó.
 *  - Revertir = deshacer la ÚLTIMA entrega (sus partidas y SU pago), nunca el anticipo.
 *  - Las preventas no tocan inventario: ni al entregar ni al revertir.
 */
class PreSalePartialDeliveryTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;
    private Store $store;
    private User $cashier;
    private Customer $customer;
    private PaymentMethod $cash;
    private CashRegisterSession $session;

    protected function setUp(): void
    {
        parent::setUp();

        $this->company = Company::create(['name' => 'Test Co']);
        $this->store   = Store::create(['company_id' => $this->company->id, 'name' => 'Centro']);
        $this->cashier = $this->makeUser('cajero@test.com', $this->store);
        $this->customer = Customer::create(['name' => 'Ana Torres']);
        $this->cash = PaymentMethod::create([
            'name' => 'Efectivo', 'allow_cash' => true, 'allow_card' => false, 'active' => true,
        ]);

        $register = CashRegister::create(['store_id' => $this->store->id, 'name' => 'Caja 1', 'active' => true]);
        $this->session = CashRegisterSession::create([
            'register_id' => $register->id, 'user_id' => $this->cashier->id,
            'opening_cash' => 0, 'opened_at' => now(), 'status' => 'open',
        ]);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private function makeUser(string $email, Store $store): User
    {
        return User::create([
            'name' => $email, 'email' => $email, 'password' => bcrypt('x'),
            'company_id' => $this->company->id, 'store_id' => $store->id,
        ]);
    }

    private function makeCatalog(string $name, float $price, bool $arrived, ?int $productId = null): PreSaleCatalog
    {
        $catalog = PreSaleCatalog::create([
            'product_name' => $name,
            'product_id'   => $productId,
            'price_1'      => $price,
            'cost'         => $arrived ? round($price * 0.6, 2) : null,
            'status'       => $arrived ? PreSaleCatalog::STATUS_ARRIVED : PreSaleCatalog::STATUS_PUBLISHED,
            'created_by'   => $this->cashier->id,
        ]);
        $catalog->storeLimits()->create(['store_id' => $this->store->id, 'limit_qty' => 50]);

        return $catalog;
    }

    /**
     * Folio LISTO con una partida por catálogo y un anticipo en efectivo.
     *
     * @param  array<int, PreSaleCatalog>  $catalogs
     * @return array{0: PreSaleOrder, 1: array<int, PreSaleOrderItem>}
     */
    private function makeReadyOrder(array $catalogs, float $advance, ?Store $store = null): array
    {
        $order = PreSaleOrder::create([
            'code'        => 'PREV-' . uniqid(),
            'store_id'    => ($store ?? $this->store)->id,
            'user_id'     => $this->cashier->id,
            'customer_id' => $this->customer->id,
            'status'      => PreSaleOrder::STATUS_READY,
        ]);

        $items = [];
        foreach ($catalogs as $catalog) {
            $items[] = $order->items()->create([
                'pre_sale_catalog_id' => $catalog->id,
                'product_id'          => $catalog->product_id,
                'quantity'            => 1,
                'price_level'         => 1,
                'unit_price'          => (float) $catalog->price_1,
                'cost'                => $catalog->cost,
                'status'              => PreSaleOrderItem::STATUS_PENDING,
            ]);
        }

        if ($advance > 0) {
            $order->payments()->create([
                'amount' => $advance, 'payment_method_id' => $this->cash->id,
                'cashier_id' => $this->cashier->id, 'notes' => 'Anticipo inicial',
            ]);
        }

        return [$order, $items];
    }

    /**
     * A $1,000 y B $500 ya llegaron; C $300 sigue en camino. Anticipo $600.
     *
     * @return array{0: PreSaleOrder, 1: array<int, PreSaleOrderItem>, 2: array<int, PreSaleCatalog>}
     */
    private function threeItemOrder(): array
    {
        $catalogs = [
            $this->makeCatalog('Figura A', 1000, true),
            $this->makeCatalog('Figura B', 500, true),
            $this->makeCatalog('Figura C', 300, false),
        ];
        [$order, $items] = $this->makeReadyOrder($catalogs, 600);

        return [$order, $items, $catalogs];
    }

    /** @param array<string, mixed> $body */
    private function deliver(PreSaleOrder $order, array $body, ?User $as = null): TestResponse
    {
        return $this->actingAs($as ?? $this->cashier)
            ->patchJson("/api/v1/pre-sale-orders/{$order->id}/status", ['status' => 'delivered'] + $body);
    }

    private function rollback(PreSaleOrder $order): TestResponse
    {
        return $this->actingAs($this->cashier)
            ->postJson("/api/v1/pre-sale-orders/{$order->id}/cancel", [
                'mode' => 'liquidation_rollback', 'reason_code' => 'error_cajero',
                'cash_session_id' => $this->session->id,
            ]);
    }

    private function arrive(PreSaleCatalog $catalog, PreSaleOrderItem $item): void
    {
        $cost = round((float) $catalog->price_1 * 0.6, 2);
        $catalog->update(['status' => PreSaleCatalog::STATUS_ARRIVED, 'cost' => $cost]);
        $item->update(['cost' => $cost]);
    }

    // ── Entrega parcial ───────────────────────────────────────────────────────

    public function test_entrega_solo_las_partidas_elegidas_y_cobra_en_la_misma_llamada(): void
    {
        [$order, [$a, $b, $c]] = $this->threeItemOrder();

        $response = $this->deliver($order, [
            'item_ids' => [$a->id, $b->id],
            'payment'  => ['amount' => 1100, 'payment_method_id' => $this->cash->id],
        ]);

        $response->assertOk()
            ->assertJsonPath('data.status', 'ready')
            ->assertJsonPath('data.paid_amount', 1700)
            ->assertJsonPath('data.balance', 100);

        $this->assertSame('delivered', $a->refresh()->status);
        $this->assertSame('delivered', $b->refresh()->status);
        $this->assertSame('pending', $c->refresh()->status);

        $delivery = PreSaleDelivery::where('pre_sale_order_id', $order->id)->sole();
        $liquidation = $order->payments()->orderByDesc('id')->first();
        $this->assertSame($liquidation->id, $delivery->payment_id);
        $this->assertEquals(1100.0, (float) $delivery->amount);
        $this->assertSame($delivery->id, $a->delivery_id);
        $this->assertSame($delivery->id, $b->delivery_id);
        $this->assertNull($c->delivery_id);

        // El reporte reparte el pago por entrega: cada partida dice qué pago la liquidó.
        $items = collect($response->json('data.items'))->keyBy('id');
        $this->assertSame($liquidation->id, $items[$a->id]['delivery_payment_id']);
        $this->assertNull($items[$c->id]['delivery_payment_id']);

        $this->assertDatabaseHas('pre_sale_order_logs', [
            'pre_sale_order_id' => $order->id, 'from_status' => 'ready', 'to_status' => 'ready',
        ]);
    }

    public function test_la_ultima_entrega_cierra_el_folio(): void
    {
        [$order, [$a, $b, $c], [, , $catalogC]] = $this->threeItemOrder();
        $this->deliver($order, [
            'item_ids' => [$a->id, $b->id],
            'payment'  => ['amount' => 1100, 'payment_method_id' => $this->cash->id],
        ])->assertOk();

        $this->arrive($catalogC, $c);

        $this->deliver($order, [
            'item_ids' => [$c->id],
            'payment'  => ['amount' => 100, 'payment_method_id' => $this->cash->id],
        ])->assertOk()
            ->assertJsonPath('data.status', 'delivered')
            ->assertJsonPath('data.balance', 0);

        $this->assertSame(2, PreSaleDelivery::where('pre_sale_order_id', $order->id)->count());
    }

    public function test_rechaza_si_lo_pagado_no_cubre_lo_entregado_y_no_guarda_el_pago(): void
    {
        [$order, [$a, $b]] = $this->threeItemOrder();

        $this->deliver($order, [
            'item_ids' => [$a->id, $b->id],
            'payment'  => ['amount' => 500, 'payment_method_id' => $this->cash->id],
        ])->assertStatus(422)->assertJsonPath('success', false);

        $this->assertSame(1, $order->payments()->count(), 'el pago de la entrega fallida no se guarda');
        $this->assertSame('pending', $a->refresh()->status);
        $this->assertSame(0, PreSaleDelivery::count());
    }

    public function test_rechaza_un_cobro_mayor_al_saldo_del_folio(): void
    {
        [$order, [$a, $b]] = $this->threeItemOrder();

        $this->deliver($order, [
            'item_ids' => [$a->id, $b->id],
            'payment'  => ['amount' => 5000, 'payment_method_id' => $this->cash->id],
        ])->assertStatus(422);

        $this->assertSame(1, $order->payments()->count());
    }

    public function test_rechaza_partidas_que_no_se_pueden_entregar(): void
    {
        [$order, [$a, , $c]] = $this->threeItemOrder();
        [, [$foreign]] = $this->makeReadyOrder([$this->makeCatalog('Otro folio', 100, true)], 100);
        $pay = ['amount' => 1200, 'payment_method_id' => $this->cash->id];

        // De otro folio.
        $this->deliver($order, ['item_ids' => [$a->id, $foreign->id], 'payment' => $pay])->assertStatus(422);
        // Su catálogo todavía no llega.
        $this->deliver($order, ['item_ids' => [$c->id], 'payment' => $pay])->assertStatus(422);
        // Sin costo real capturado.
        $a->update(['cost' => null]);
        $this->deliver($order, ['item_ids' => [$a->id], 'payment' => $pay])->assertStatus(422);
        // Ya entregada.
        $a->update(['cost' => 600, 'status' => 'delivered', 'delivered_at' => now()]);
        $this->deliver($order, ['item_ids' => [$a->id]])->assertStatus(422);

        $this->assertSame(1, $order->payments()->count());
        $this->assertSame('pending', $foreign->refresh()->status);
        $this->assertSame(0, PreSaleDelivery::count());
    }

    public function test_sin_item_ids_se_comporta_como_antes(): void
    {
        [$order, [$a, $b, $c]] = $this->threeItemOrder();

        // App móvil: abona aparte y luego marca el folio como entregado.
        $this->deliver($order, [])->assertOk()->assertJsonPath('data.status', 'ready');

        $this->assertSame('delivered', $a->refresh()->status);
        $this->assertSame('delivered', $b->refresh()->status);
        $this->assertSame('pending', $c->refresh()->status);
        $this->assertSame(0, PreSaleDelivery::count(), 'el flujo viejo no registra entregas');
    }

    public function test_rechaza_un_cobro_sin_partidas_por_entregar(): void
    {
        // Carrito guardado que ya no corresponde al folio: manda cobro pero
        // ninguna partida, y en el folio ya no queda nada llegado por entregar.
        [$order, [$a, $b]] = $this->threeItemOrder();
        $a->update(['status' => 'delivered', 'delivered_at' => now()]);
        $b->update(['status' => 'delivered', 'delivered_at' => now()]);

        $this->deliver($order, ['payment' => ['amount' => 100, 'payment_method_id' => $this->cash->id]])
            ->assertStatus(422);

        $this->assertSame(1, $order->payments()->count(), 'el cobro no queda suelto en el folio');
    }

    public function test_una_partida_entregada_con_cobro_no_se_regresa_con_el_boton_por_partida(): void
    {
        [$order, [$a, $b]] = $this->threeItemOrder();
        $this->deliver($order, [
            'item_ids' => [$a->id, $b->id],
            'payment'  => ['amount' => 1100, 'payment_method_id' => $this->cash->id],
        ])->assertOk();

        // El endpoint viejo (toggle por partida) la dejaría cobrada y sin entregar.
        $this->actingAs($this->cashier)
            ->patchJson("/api/v1/pre-sale-orders/{$order->id}/items/{$a->id}/deliver", ['status' => 'pending'])
            ->assertStatus(422);

        $this->assertSame('delivered', $a->refresh()->status);
    }

    public function test_folio_ya_pagado_se_entrega_sin_cobro(): void
    {
        [$order, [$item]] = $this->makeReadyOrder([$this->makeCatalog('Pagado', 200, true)], 200);

        $this->deliver($order, ['item_ids' => [$item->id]])
            ->assertOk()->assertJsonPath('data.status', 'delivered');

        $delivery = PreSaleDelivery::sole();
        $this->assertNull($delivery->payment_id);
        $this->assertEquals(0.0, (float) $delivery->amount);
    }

    public function test_usuario_de_otra_tienda_no_entrega(): void
    {
        [$order, [$a]] = $this->threeItemOrder();
        $otherStore = Store::create(['company_id' => $this->company->id, 'name' => 'Otay']);
        $intruder   = $this->makeUser('otro@test.com', $otherStore);

        $this->deliver($order, ['item_ids' => [$a->id]], $intruder)->assertStatus(403);
        $this->assertSame('pending', $a->refresh()->status);
    }

    public function test_entregar_no_mueve_el_inventario(): void
    {
        $product = Product::create([
            'name' => 'Figura ligada', 'sku' => 'FIG-1', 'cost' => 120, 'active' => true,
            'product_type' => Product::TYPE_PRODUCT,
        ]);
        $warehouse = Warehouse::create([
            'company_id' => $this->company->id, 'store_id' => $this->store->id,
            'name' => 'Exhibición', 'type' => 'store', 'active' => true,
        ]);
        Inventory::create(['product_id' => $product->id, 'warehouse_id' => $warehouse->id, 'quantity' => 10]);
        [$order, [$item]] = $this->makeReadyOrder([$this->makeCatalog('Ligada', 200, true, $product->id)], 50);

        $this->deliver($order, [
            'item_ids' => [$item->id],
            'payment'  => ['amount' => 150, 'payment_method_id' => $this->cash->id],
        ])->assertOk();
        $this->assertEquals(10.0, (float) Inventory::where('product_id', $product->id)->value('quantity'));

        $this->rollback($order)->assertOk();
        $this->assertEquals(
            10.0,
            (float) Inventory::where('product_id', $product->id)->value('quantity'),
            'revertir no puede sumar un stock que la entrega nunca restó',
        );
    }

    // ── Revertir la última entrega ────────────────────────────────────────────

    public function test_revertir_deshace_solo_la_ultima_entrega_y_su_pago(): void
    {
        [$order, [$a, $b, $c], [, , $catalogC]] = $this->threeItemOrder();
        $this->deliver($order, [
            'item_ids' => [$a->id, $b->id],
            'payment'  => ['amount' => 1100, 'payment_method_id' => $this->cash->id],
        ])->assertOk();
        $this->arrive($catalogC, $c);
        $this->deliver($order, [
            'item_ids' => [$c->id],
            'payment'  => ['amount' => 100, 'payment_method_id' => $this->cash->id],
        ])->assertOk();

        // 1ª reversa: solo C y sus $100. El folio cerrado vuelve a «Listo».
        $this->rollback($order)->assertOk()->assertJsonPath('data.cancellation.amount_refunded', 100);

        $order->refresh();
        $this->assertSame(PreSaleOrder::STATUS_READY, $order->status);
        $this->assertSame('pending', $c->refresh()->status);
        $this->assertNull($c->delivered_at);
        $this->assertSame('delivered', $a->refresh()->status);
        $this->assertEquals(1700.0, (float) $order->payments()->sum('amount'));

        // 2ª reversa: A y B con sus $1,100. El anticipo se queda.
        $this->rollback($order)->assertOk()->assertJsonPath('data.cancellation.amount_refunded', 1100);

        $this->assertSame('pending', $a->refresh()->status);
        $this->assertSame('pending', $b->refresh()->status);
        $this->assertEquals(600.0, (float) $order->payments()->sum('amount'));
        $this->assertSame(1, $order->payments()->count());
        $this->assertSame(0, PreSaleDelivery::whereNull('reverted_at')->count());

        // Dinero: una salida de caja por cada reversa, en la caja de quien revierte.
        $this->assertEquals(
            1200.0,
            (float) CashMovement::where('register_session_id', $this->session->id)->where('type', 'salida')->sum('amount'),
        );

        // Registro: snapshot del pago borrado + historial del folio.
        $last = SaleCancellation::where('pre_sale_order_id', $order->id)->orderByDesc('id')->first();
        $this->assertCount(2, $last->items_snapshot, 'solo las partidas de esa entrega');
        $this->assertEquals(1100.0, (float) $last->payment_snapshot['amount']);
        $this->assertSame('Efectivo', $last->payment_snapshot['payment_method']);
        $this->assertTrue(
            PreSaleOrderLog::where('pre_sale_order_id', $order->id)
                ->where('notes', 'like', '%revertida%')->exists(),
            'la reversa queda en el historial del folio',
        );

        // Ya no hay entregas que revertir.
        $this->rollback($order)->assertStatus(422);
    }

    public function test_revertir_una_liquidacion_en_cero_no_toca_el_anticipo(): void
    {
        [$order, [$item]] = $this->makeReadyOrder([$this->makeCatalog('Pagado', 200, true)], 200);
        $this->deliver($order, ['item_ids' => [$item->id]])->assertOk();

        $this->rollback($order)->assertOk()->assertJsonPath('data.cancellation.amount_refunded', 0);

        $this->assertSame(PreSaleOrder::STATUS_READY, $order->refresh()->status);
        $this->assertSame('pending', $item->refresh()->status);
        $this->assertEquals(200.0, (float) $order->payments()->sum('amount'), 'el anticipo sigue en el folio');
        $this->assertSame(0, CashMovement::where('type', 'salida')->count());
    }

    public function test_folio_viejo_sin_registro_de_entrega_no_devuelve_un_anticipo_antiguo(): void
    {
        // Folio liquidado con el flujo anterior: pagado completo con su anticipo
        // inicial y entregado después sin cobro. «El último pago» es el anticipo.
        [$order, [$item]] = $this->makeReadyOrder([$this->makeCatalog('Viejo', 200, true)], 200);
        $item->update(['status' => 'delivered', 'delivered_at' => now()]);
        $order->update(['status' => PreSaleOrder::STATUS_DELIVERED]);

        $this->rollback($order)->assertOk()->assertJsonPath('data.cancellation.amount_refunded', 0);

        $this->assertSame(1, $order->payments()->count());
        $this->assertSame('pending', $item->refresh()->status);
    }

    public function test_folio_viejo_sin_registro_de_entrega_devuelve_el_pago_de_la_liquidacion(): void
    {
        // Flujo anterior: anticipo al crear + un pago aparte al recoger.
        [$order, [$item]] = $this->makeReadyOrder([$this->makeCatalog('Viejo', 500, true)], 200);
        $order->payments()->create(['amount' => 300, 'payment_method_id' => $this->cash->id, 'cashier_id' => $this->cashier->id]);
        $item->update(['status' => 'delivered', 'delivered_at' => now()]);
        $order->update(['status' => PreSaleOrder::STATUS_DELIVERED]);

        $this->rollback($order)->assertOk()->assertJsonPath('data.cancellation.amount_refunded', 300);

        $this->assertEquals(200.0, (float) $order->payments()->sum('amount'), 'el anticipo se queda');
        $this->assertSame(PreSaleOrder::STATUS_READY, $order->refresh()->status);
    }

    public function test_cancelar_todo_el_folio_se_bloquea_mientras_tenga_entregas(): void
    {
        [$order, [$a, $b]] = $this->threeItemOrder();
        $this->deliver($order, [
            'item_ids' => [$a->id, $b->id],
            'payment'  => ['amount' => 1100, 'payment_method_id' => $this->cash->id],
        ])->assertOk();

        $this->actingAs($this->cashier)
            ->postJson("/api/v1/pre-sale-orders/{$order->id}/cancel", [
                'mode' => 'full', 'reason_code' => 'otro', 'cash_session_id' => $this->session->id,
            ])->assertStatus(422);

        $this->assertSame(PreSaleOrder::STATUS_READY, $order->refresh()->status);
        $this->assertSame(2, $order->payments()->count());
    }
}
