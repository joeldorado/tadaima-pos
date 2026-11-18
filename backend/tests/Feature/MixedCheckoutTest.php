<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\CashRegister;
use App\Models\CashRegisterSession;
use App\Models\Company;
use App\Models\Customer;
use App\Models\Inventory;
use App\Models\InventoryMovement;
use App\Models\PaymentMethod;
use App\Models\PreSaleCatalog;
use App\Models\PreSaleDelivery;
use App\Models\PreSaleOrder;
use App\Models\PreSaleOrderItem;
use App\Models\PreSaleOrderPayment;
use App\Models\Product;
use App\Models\Sale;
use App\Models\Store;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Testing\TestResponse;
use Tests\TestCase;

/**
 * Cobro mixto atómico (2026-11-17, ticket T-006): `POST /sales/mixed`.
 *
 * Caso de tienda: una mesa con un folio de preventa cargado y un producto
 * normal se cobraba en tres llamadas (venta → preventa nueva → entrega del
 * folio). Si la última fallaba, la venta ya estaba guardada. El cajero cobró el
 * mismo folio desde otra mesa: quedaron dos ventas de más y el folio respondió
 * 422 sin avisar que la venta sí se guardó.
 *
 * Invariante: entrega del folio + venta + preventa nueva son UNA transacción.
 * Si cualquiera falla, no queda venta, ni pago, ni entrega, ni stock movido.
 */
class MixedCheckoutTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;
    private Store $store;
    private Warehouse $warehouse;
    private User $cashier;
    private Customer $customer;
    private PaymentMethod $cash;
    private CashRegister $register;
    private CashRegisterSession $session;

    protected function setUp(): void
    {
        parent::setUp();

        $this->company   = Company::create(['name' => 'Test Co']);
        $this->store     = Store::create(['company_id' => $this->company->id, 'name' => 'Centro']);
        $this->warehouse = Warehouse::create([
            'company_id' => $this->company->id, 'store_id' => $this->store->id,
            'name' => 'Exhibición', 'type' => 'store', 'active' => true,
        ]);
        $this->cashier  = $this->makeUser('cajero@test.com', $this->store);
        $this->customer = Customer::create(['name' => 'Ana Torres']);
        $this->cash     = PaymentMethod::create([
            'name' => 'Efectivo', 'allow_cash' => true, 'allow_card' => false, 'active' => true,
        ]);
        $this->register = CashRegister::create(['store_id' => $this->store->id, 'name' => 'Caja 1', 'active' => true]);
        $this->session  = $this->makeSession($this->cashier, now()->subHour());
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private function makeUser(string $email, Store $store): User
    {
        return User::create([
            'name' => $email, 'email' => $email, 'password' => bcrypt('x'),
            'company_id' => $this->company->id, 'store_id' => $store->id,
        ]);
    }

    private function makeSession(User $user, \DateTimeInterface $openedAt, string $status = 'open'): CashRegisterSession
    {
        return CashRegisterSession::create([
            'register_id' => $this->register->id, 'user_id' => $user->id,
            'opening_cash' => 0, 'opened_at' => $openedAt, 'status' => $status,
        ]);
    }

    private function makeProduct(float $price, int $qty = 10): Product
    {
        $product = Product::create([
            'company_id' => $this->company->id,
            'name' => 'Producto ' . uniqid(), 'sku' => 'SKU-' . uniqid(),
            'cost' => round($price * 0.5, 2), 'active' => true, 'product_type' => Product::TYPE_PRODUCT,
        ]);
        $product->price()->create(['price_1' => $price]);
        Inventory::create(['product_id' => $product->id, 'warehouse_id' => $this->warehouse->id, 'quantity' => $qty]);

        return $product;
    }

    private function makeCatalog(string $name, float $price, bool $arrived, int $limit = 50): PreSaleCatalog
    {
        $catalog = PreSaleCatalog::create([
            'product_name' => $name,
            'price_1'      => $price,
            'cost'         => round($price * 0.6, 2),
            'status'       => $arrived ? PreSaleCatalog::STATUS_ARRIVED : PreSaleCatalog::STATUS_PUBLISHED,
            'created_by'   => $this->cashier->id,
        ]);
        $catalog->storeLimits()->create(['store_id' => $this->store->id, 'limit_qty' => $limit]);

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

    /** Folio de una figura de $700 con $300 de anticipo: faltan $400. */
    private function folio(): array
    {
        [$order, [$item]] = $this->makeReadyOrder([$this->makeCatalog('Figura A', 700, true)], 300);

        return [$order, $item];
    }

    /**
     * Bloque de liquidación del folio.
     *
     * @return array<string, mixed>
     */
    private function liquidation(PreSaleOrder $order, PreSaleOrderItem $item, float $amount): array
    {
        return [
            'pre_sale_order_id' => $order->id,
            'item_ids'          => [$item->id],
            ...($amount > 0 ? ['payment' => ['amount' => $amount, 'payment_method_id' => $this->cash->id]] : []),
        ];
    }

    /**
     * Bloque de venta regular de UNA pieza.
     *
     * @return array<string, mixed>
     */
    private function saleBlock(Product $product, float $price): array
    {
        return [
            'calc_version' => 2,
            'items'        => [['product_id' => $product->id, 'quantity' => 1, 'price' => $price]],
            'payments'     => [['payment_method_id' => $this->cash->id, 'amount' => $price]],
        ];
    }

    /** @param array<string, mixed> $body */
    private function mixed(array $body, ?User $as = null): TestResponse
    {
        return $this->actingAs($as ?? $this->cashier)->postJson('/api/v1/sales/mixed', $body + [
            'store_id'            => $this->store->id,
            'register_session_id' => $this->session->id,
            'customer_id'         => $this->customer->id,
        ]);
    }

    private function stockOf(Product $product): float
    {
        return (float) Inventory::where('product_id', $product->id)->value('quantity');
    }

    /** Nada se guardó: ni venta, ni entrega, ni pago nuevo, ni stock movido. */
    private function assertNothingSaved(PreSaleOrder $order, PreSaleOrderItem $item, ?Product $product = null): void
    {
        $this->assertSame(0, Sale::count(), 'no debe quedar ninguna venta');
        $this->assertSame(0, PreSaleDelivery::count(), 'no debe quedar ninguna entrega');
        $this->assertSame(1, PreSaleOrderPayment::where('pre_sale_order_id', $order->id)->count(), 'solo el anticipo');
        $this->assertSame(PreSaleOrder::STATUS_READY, $order->refresh()->status);
        $this->assertSame(PreSaleOrderItem::STATUS_PENDING, $item->refresh()->status);
        $this->assertSame(1, PreSaleOrder::count(), 'no debe quedar ningún folio nuevo');
        if ($product !== null) {
            $this->assertEquals(10, $this->stockOf($product), 'el stock no se mueve');
            $this->assertSame(0, InventoryMovement::where('product_id', $product->id)->count());
        }
    }

    // ── Cobro correcto ────────────────────────────────────────────────────────

    public function test_cobra_folio_y_venta_en_una_sola_llamada(): void
    {
        [$order, $item] = $this->folio();
        $product = $this->makeProduct(250);

        $res = $this->mixed([
            'liquidation' => $this->liquidation($order, $item, 400),
            'sale'        => $this->saleBlock($product, 250) + ['cash_received' => 700, 'change_amount' => 50],
        ]);

        $res->assertStatus(201)
            ->assertJsonPath('success', true)
            ->assertJsonPath('data.delivered_order.id', $order->id)
            ->assertJsonPath('data.delivered_order.status', 'delivered')
            ->assertJsonPath('data.delivered_order.items.0.status', 'delivered')
            ->assertJsonPath('data.new_order', null);
        $this->assertEquals(700, $res->json('data.delivered_order.paid_amount'));
        $this->assertEquals(0, $res->json('data.delivered_order.balance'));
        $this->assertCount(2, $res->json('data.delivered_order.payments'));
        $this->assertEquals(250, $res->json('data.sale.total'));

        $sale = Sale::sole();
        $this->assertSame($sale->id, $res->json('data.sale.id'));
        $this->assertEquals(250, (float) $sale->total);
        $this->assertEquals(700, (float) $sale->cash_received);
        $this->assertSame($this->session->id, (int) $sale->register_session_id);
        $this->assertEquals(9, $this->stockOf($product));

        $this->assertSame(PreSaleOrder::STATUS_DELIVERED, $order->refresh()->status);
        $delivery = PreSaleDelivery::sole();
        $this->assertEquals(400, (float) $delivery->amount);
        $this->assertNotNull($delivery->payment_id);
        $this->assertSame($delivery->id, (int) $item->refresh()->delivery_id);
    }

    public function test_solo_el_folio_sin_venta_ni_preventa_nueva(): void
    {
        [$order, $item] = $this->folio();

        $res = $this->mixed(['liquidation' => $this->liquidation($order, $item, 400)]);

        $res->assertStatus(201)
            ->assertJsonPath('data.sale', null)
            ->assertJsonPath('data.new_order', null)
            ->assertJsonPath('data.delivered_order.status', 'delivered');
        $this->assertSame(0, Sale::count());
        $this->assertSame(1, PreSaleDelivery::count());
    }

    public function test_entrega_parcial_deja_el_folio_listo(): void
    {
        [$order, [$a, $b]] = $this->makeReadyOrder([
            $this->makeCatalog('Figura A', 700, true),
            $this->makeCatalog('Figura B', 300, true),
        ], 200);
        $product = $this->makeProduct(250);

        // Anticipo parejo por pieza: $100 a cada una. A le faltan $600.
        $res = $this->mixed([
            'liquidation' => $this->liquidation($order, $a, 600),
            'sale'        => $this->saleBlock($product, 250),
        ]);

        $res->assertStatus(201)->assertJsonPath('data.delivered_order.status', 'ready');
        $this->assertSame(PreSaleOrderItem::STATUS_DELIVERED, $a->refresh()->status);
        $this->assertSame(PreSaleOrderItem::STATUS_PENDING, $b->refresh()->status);
        $this->assertSame(1, Sale::count());
    }

    public function test_folio_con_descuento_por_pieza_danada(): void
    {
        [$order, $item] = $this->folio();
        $product = $this->makeProduct(250);

        // $100 de descuento a la pieza: de los $400 que faltaban se cobran $300.
        $res = $this->mixed([
            'liquidation' => $this->liquidation($order, $item, 300) + [
                'item_discounts' => [[
                    'item_id' => $item->id, 'kind' => 'fixed', 'basis' => 'line', 'value' => 100, 'reason' => 'danado',
                ]],
            ],
            'sale' => $this->saleBlock($product, 250),
        ]);

        $res->assertStatus(201)->assertJsonPath('data.delivered_order.status', 'delivered');
        $this->assertEquals(100, (float) $item->refresh()->discount_amount);
        $this->assertEquals(0, $res->json('data.delivered_order.balance'));
    }

    public function test_la_venta_conserva_descuento_comentario_y_regalo_por_linea(): void
    {
        [$order, $item] = $this->folio();
        $product = $this->makeProduct(250);
        $regalo  = $this->makeProduct(120);

        // $250 con 10% de descuento = $225; el regalo va en $0.
        $res = $this->mixed([
            'liquidation' => $this->liquidation($order, $item, 400),
            'sale'        => [
                'calc_version' => 2,
                'items'        => [
                    [
                        'product_id' => $product->id, 'quantity' => 1, 'price' => 250, 'price_level' => 'a',
                        'comment' => 'caja maltratada',
                        'line_discount' => ['kind' => 'percent', 'basis' => 'line', 'value' => 10, 'reason' => 'exhibicion', 'note' => 'esquina'],
                    ],
                    ['product_id' => $regalo->id, 'quantity' => 1, 'price' => 120, 'is_gift' => true, 'gift_note' => 'cliente frecuente'],
                ],
                'payments'     => [['payment_method_id' => $this->cash->id, 'amount' => 225]],
            ],
        ]);

        $res->assertStatus(201);
        $sale = Sale::with('items.gift')->sole();
        $this->assertEquals(225, (float) $sale->total);
        $this->assertEquals(25, (float) $sale->discount);

        $linea = $sale->items->firstWhere('product_id', $product->id);
        $this->assertEquals(25, (float) $linea->discount_amount);
        $this->assertSame('exhibicion', $linea->discount_reason);
        $this->assertSame('esquina', $linea->discount_note);
        $this->assertSame('caja maltratada', $linea->comment);

        $lineaRegalo = $sale->items->firstWhere('product_id', $regalo->id);
        $this->assertEquals(0, (float) $lineaRegalo->total);
        $this->assertEquals(120, (float) $lineaRegalo->gift->list_price);
        $this->assertSame('cliente frecuente', $lineaRegalo->gift->note);
        $this->assertEquals(9, $this->stockOf($regalo));
    }

    public function test_el_pago_de_la_venta_que_no_cuadra_no_entrega_el_folio(): void
    {
        [$order, $item] = $this->folio();
        $product = $this->makeProduct(250);

        $res = $this->mixed([
            'liquidation' => $this->liquidation($order, $item, 400),
            'sale'        => [
                'calc_version' => 2,
                'items'        => [['product_id' => $product->id, 'quantity' => 1, 'price' => 250]],
                'payments'     => [['payment_method_id' => $this->cash->id, 'amount' => 200]],
            ],
        ]);

        $res->assertStatus(422);
        $this->assertNothingSaved($order, $item, $product);
    }

    public function test_folio_mas_preventa_nueva_ligada_a_la_venta(): void
    {
        [$order, $item] = $this->folio();
        $product = $this->makeProduct(250);
        $nuevo   = $this->makeCatalog('Figura nueva', 900, false);

        $res = $this->mixed([
            'liquidation' => $this->liquidation($order, $item, 400),
            'sale'        => $this->saleBlock($product, 250),
            'new_order'   => [
                'items'             => [['catalog_id' => $nuevo->id, 'quantity' => 2, 'price_level' => 1]],
                'advance_amount'    => 500,
                'payment_method_id' => $this->cash->id,
            ],
        ]);

        $res->assertStatus(201);
        $sale     = Sale::sole();
        $newOrder = PreSaleOrder::where('id', '!=', $order->id)->sole();

        $this->assertSame($newOrder->id, $res->json('data.new_order.id'));
        $this->assertSame($newOrder->code, $res->json('data.new_order.code'));
        $this->assertSame($sale->id, (int) $newOrder->linked_sale_id);
        $this->assertSame(PreSaleOrder::STATUS_PENDING, $newOrder->status);
        $this->assertSame($this->customer->id, (int) $newOrder->customer_id);
        $this->assertEquals(500, $res->json('data.new_order.paid_amount'));
        $this->assertEquals(1300, $res->json('data.new_order.balance'));
        $this->assertSame(2, (int) $newOrder->items()->sole()->quantity);
        $this->assertSame(PreSaleOrder::STATUS_DELIVERED, $order->refresh()->status);
    }

    public function test_folio_mas_preventa_nueva_sin_venta(): void
    {
        [$order, $item] = $this->folio();
        $nuevo = $this->makeCatalog('Figura nueva', 900, false);

        $res = $this->mixed([
            'liquidation' => $this->liquidation($order, $item, 400),
            'new_order'   => ['items' => [['catalog_id' => $nuevo->id, 'quantity' => 1, 'price_level' => 1]]],
        ]);

        $res->assertStatus(201)->assertJsonPath('data.sale', null);
        $this->assertNull(PreSaleOrder::where('id', '!=', $order->id)->sole()->linked_sale_id);
        $this->assertSame(0, Sale::count());
    }

    // ── Si algo falla, no se guarda nada ──────────────────────────────────────

    public function test_folio_ya_entregado_no_crea_la_venta(): void
    {
        [$order, $item] = $this->folio();
        $product = $this->makeProduct(250);
        $body = [
            'liquidation' => $this->liquidation($order, $item, 400),
            'sale'        => $this->saleBlock($product, 250),
        ];

        // Primer cobro bien; el segundo es la otra mesa con el mismo folio.
        $this->mixed($body)->assertStatus(201);
        $res = $this->mixed($body);

        $res->assertStatus(422)
            ->assertJsonPath('success', false)
            ->assertJsonPath('errors.code.0', 'PRESALE_ORDER_ALREADY_DELIVERED');
        $this->assertStringContainsString('no está listo para liquidar', (string) $res->json('error'));
        $this->assertSame(1, Sale::count(), 'solo la venta del primer cobro');
        $this->assertSame(2, PreSaleOrderPayment::where('pre_sale_order_id', $order->id)->count(), 'sin pago nuevo');
        $this->assertSame(1, PreSaleDelivery::count());
        $this->assertEquals(9, $this->stockOf($product), 'el stock solo bajó una vez');
    }

    public function test_folio_entregado_por_fuera_no_guarda_nada(): void
    {
        [$order, $item] = $this->folio();
        $product = $this->makeProduct(250);
        $order->update(['status' => PreSaleOrder::STATUS_DELIVERED]);

        $res = $this->mixed([
            'liquidation' => $this->liquidation($order, $item, 400),
            'sale'        => $this->saleBlock($product, 250),
        ]);

        $res->assertStatus(422)->assertJsonPath('errors.code.0', 'PRESALE_ORDER_ALREADY_DELIVERED');
        $this->assertSame(0, Sale::count());
        $this->assertSame(1, PreSaleOrderPayment::where('pre_sale_order_id', $order->id)->count());
        $this->assertEquals(10, $this->stockOf($product));
        $this->assertSame(0, InventoryMovement::where('product_id', $product->id)->count());
    }

    public function test_folio_cancelado_responde_con_su_propio_codigo(): void
    {
        [$order, $item] = $this->folio();
        $product = $this->makeProduct(250);
        $order->update(['status' => PreSaleOrder::STATUS_CANCELLED]);

        $res = $this->mixed([
            'liquidation' => $this->liquidation($order, $item, 400),
            'sale'        => $this->saleBlock($product, 250),
        ]);

        $res->assertStatus(422)->assertJsonPath('errors.code.0', 'PRESALE_ORDER_NOT_READY');
        $this->assertSame(0, Sale::count());
        $this->assertEquals(10, $this->stockOf($product));
    }

    public function test_partida_ya_entregada_en_folio_parcial_no_guarda_nada(): void
    {
        [$order, [$a, $b]] = $this->makeReadyOrder([
            $this->makeCatalog('Figura A', 700, true),
            $this->makeCatalog('Figura B', 300, true),
        ], 1000);
        $product = $this->makeProduct(250);
        $this->mixed(['liquidation' => $this->liquidation($order, $a, 0)])->assertStatus(201);

        // La otra mesa todavía trae la figura A cargada.
        $res = $this->mixed([
            'liquidation' => $this->liquidation($order, $a, 0),
            'sale'        => $this->saleBlock($product, 250),
        ]);

        $res->assertStatus(422)->assertJsonPath('errors.code.0', 'PRESALE_ORDER_ALREADY_DELIVERED');
        $this->assertSame(0, Sale::count());
        $this->assertSame(1, PreSaleDelivery::count());
        $this->assertSame(PreSaleOrderItem::STATUS_PENDING, $b->refresh()->status);
        $this->assertEquals(10, $this->stockOf($product));
    }

    public function test_venta_rechazada_no_entrega_el_folio(): void
    {
        [$order, $item] = $this->folio();
        $product = $this->makeProduct(250);

        // $199 no es un precio del catálogo: la venta se rechaza.
        $res = $this->mixed([
            'liquidation' => $this->liquidation($order, $item, 400),
            'sale'        => $this->saleBlock($product, 199),
        ]);

        $res->assertStatus(422);
        $this->assertStringContainsString('fuera del catálogo', (string) $res->json('error'));
        $this->assertNull($res->json('errors.code'));
        $this->assertNothingSaved($order, $item, $product);
    }

    public function test_venta_sin_stock_no_entrega_el_folio(): void
    {
        [$order, $item] = $this->folio();
        $product = $this->makeProduct(250, 0);

        $res = $this->mixed([
            'liquidation' => $this->liquidation($order, $item, 400),
            'sale'        => $this->saleBlock($product, 250),
        ]);

        $res->assertStatus(422);
        $this->assertSame(0, Sale::count());
        $this->assertSame(0, PreSaleDelivery::count());
        $this->assertSame(PreSaleOrder::STATUS_READY, $order->refresh()->status);
    }

    public function test_preventa_nueva_sin_cupo_revierte_venta_y_entrega(): void
    {
        [$order, $item] = $this->folio();
        $product = $this->makeProduct(250);
        $nuevo   = $this->makeCatalog('Figura nueva', 900, false, 1);

        // Es el último paso: para entonces la entrega y la venta ya se escribieron.
        $res = $this->mixed([
            'liquidation' => $this->liquidation($order, $item, 400),
            'sale'        => $this->saleBlock($product, 250),
            'new_order'   => ['items' => [['catalog_id' => $nuevo->id, 'quantity' => 2, 'price_level' => 1]]],
        ]);

        $res->assertStatus(422);
        $this->assertStringContainsString('solo tiene 1 unidades disponibles', (string) $res->json('error'));
        $this->assertNothingSaved($order, $item, $product);
    }

    public function test_cobro_del_folio_que_no_cubre_lo_entregado_no_crea_la_venta(): void
    {
        [$order, $item] = $this->folio();
        $product = $this->makeProduct(250);

        // Faltan $400 y solo se cobran $100.
        $res = $this->mixed([
            'liquidation' => $this->liquidation($order, $item, 100),
            'sale'        => $this->saleBlock($product, 250),
        ]);

        $res->assertStatus(422);
        $this->assertNothingSaved($order, $item, $product);
    }

    // ── Candados ──────────────────────────────────────────────────────────────

    public function test_gerente_de_otra_tienda_recibe_403(): void
    {
        [$order, $item] = $this->folio();
        $product    = $this->makeProduct(250);
        $otherStore = Store::create(['company_id' => $this->company->id, 'name' => 'Otay']);
        $intruder   = $this->makeUser('gerente-otay@test.com', $otherStore);

        $res = $this->mixed([
            'liquidation' => $this->liquidation($order, $item, 400),
            'sale'        => $this->saleBlock($product, 250),
        ], $intruder);

        $res->assertStatus(403);
        $this->assertNothingSaved($order, $item, $product);
    }

    public function test_folio_de_otra_tienda_recibe_403(): void
    {
        $otherStore = Store::create(['company_id' => $this->company->id, 'name' => 'Otay']);
        [$order, [$item]] = $this->makeReadyOrder([$this->makeCatalog('Figura A', 700, true)], 300, $otherStore);
        $product = $this->makeProduct(250);

        // La venta es de MI tienda, pero el folio es de otra.
        $res = $this->mixed([
            'liquidation' => $this->liquidation($order, $item, 400),
            'sale'        => $this->saleBlock($product, 250),
        ]);

        $res->assertStatus(403);
        $this->assertNothingSaved($order, $item, $product);
    }

    public function test_caja_vieja_recibe_422_y_no_guarda_nada(): void
    {
        [$order, $item] = $this->folio();
        $product = $this->makeProduct(250);
        // Abierta hace 30 h: día de negocio anterior y más de 12 h.
        $this->session->update(['opened_at' => now()->subHours(30)]);

        $res = $this->mixed([
            'liquidation' => $this->liquidation($order, $item, 400),
            'sale'        => $this->saleBlock($product, 250),
        ]);

        $res->assertStatus(422)->assertJsonPath('errors.code.0', 'CASH_SESSION_STALE');
        $this->assertNothingSaved($order, $item, $product);
    }

    public function test_caja_cerrada_recibe_422(): void
    {
        [$order, $item] = $this->folio();
        $this->session->update(['status' => 'closed']);

        // Sin venta regular: el candado de caja aplica igual a todo el cobro.
        $res = $this->mixed(['liquidation' => $this->liquidation($order, $item, 400)]);

        $res->assertStatus(422)->assertJsonPath('errors.code.0', 'CASH_SESSION_CLOSED');
        $this->assertNothingSaved($order, $item);
    }

    // ── Validación ────────────────────────────────────────────────────────────

    public function test_la_liquidacion_es_obligatoria(): void
    {
        $product = $this->makeProduct(250);

        $res = $this->mixed(['sale' => $this->saleBlock($product, 250)]);

        $res->assertStatus(422)->assertJsonValidationErrors(['liquidation']);
        $this->assertSame(0, Sale::count());
    }

    public function test_las_piezas_del_folio_siempre_viajan(): void
    {
        [$order, $item] = $this->folio();
        $product = $this->makeProduct(250);

        // Sin `item_ids` el servicio entregaría todo lo llegado sin validar el
        // dinero (el modo de la app móvil). Aquí no se acepta.
        $res = $this->mixed([
            'liquidation' => ['pre_sale_order_id' => $order->id],
            'sale'        => $this->saleBlock($product, 250),
        ]);

        $res->assertStatus(422)->assertJsonValidationErrors(['liquidation.item_ids']);
        $this->assertNothingSaved($order, $item, $product);
    }

    public function test_un_bloque_vacio_es_422_y_no_un_error_del_servidor(): void
    {
        [$order, $item] = $this->folio();

        $this->mixed(['liquidation' => $this->liquidation($order, $item, 400), 'sale' => []])
            ->assertStatus(422)->assertJsonValidationErrors(['sale']);
        $this->mixed(['liquidation' => $this->liquidation($order, $item, 400), 'new_order' => []])
            ->assertStatus(422)->assertJsonValidationErrors(['new_order']);
        $this->assertNothingSaved($order, $item);
    }

    public function test_venta_sin_cliente_se_cobra_igual(): void
    {
        [$order, $item] = $this->folio();
        $product = $this->makeProduct(250);

        $res = $this->actingAs($this->cashier)->postJson('/api/v1/sales/mixed', [
            'store_id'            => $this->store->id,
            'register_session_id' => $this->session->id,
            'liquidation'         => $this->liquidation($order, $item, 400),
            'sale'                => $this->saleBlock($product, 250),
        ]);

        $res->assertStatus(201);
        $this->assertNull(Sale::sole()->customer_id);
    }

    public function test_preventa_nueva_exige_cliente(): void
    {
        [$order, $item] = $this->folio();
        $nuevo = $this->makeCatalog('Figura nueva', 900, false);

        $res = $this->actingAs($this->cashier)->postJson('/api/v1/sales/mixed', [
            'store_id'            => $this->store->id,
            'register_session_id' => $this->session->id,
            'liquidation'         => $this->liquidation($order, $item, 400),
            'new_order'           => ['items' => [['catalog_id' => $nuevo->id, 'quantity' => 1, 'price_level' => 1]]],
        ]);

        $res->assertStatus(422)->assertJsonValidationErrors(['customer_id']);
        $this->assertNothingSaved($order, $item);
    }

    public function test_descuento_de_una_pieza_que_no_se_entrega_se_rechaza(): void
    {
        [$order, [$a, $b]] = $this->makeReadyOrder([
            $this->makeCatalog('Figura A', 700, true),
            $this->makeCatalog('Figura B', 300, true),
        ], 200);

        $res = $this->mixed([
            'liquidation' => $this->liquidation($order, $a, 600) + [
                'item_discounts' => [[
                    'item_id' => $b->id, 'kind' => 'fixed', 'basis' => 'line', 'value' => 50, 'reason' => 'danado',
                ]],
            ],
        ]);

        $res->assertStatus(422)->assertJsonValidationErrors(['liquidation.item_discounts.0.item_id']);
        $this->assertSame(0, PreSaleDelivery::count());
    }

    public function test_un_regalo_con_descuento_se_rechaza_igual_que_en_la_venta_normal(): void
    {
        [$order, $item] = $this->folio();
        $product = $this->makeProduct(250);

        $res = $this->mixed([
            'liquidation' => $this->liquidation($order, $item, 400),
            'sale'        => [
                'calc_version' => 2,
                'items'        => [[
                    'product_id' => $product->id, 'quantity' => 1, 'price' => 250, 'is_gift' => true,
                    'line_discount' => ['kind' => 'fixed', 'basis' => 'line', 'value' => 10, 'reason' => 'otro'],
                ]],
                'payments'     => [['payment_method_id' => $this->cash->id, 'amount' => 0]],
            ],
        ]);

        $res->assertStatus(422)->assertJsonValidationErrors(['sale.items.0.is_gift']);
        $this->assertNothingSaved($order, $item, $product);
    }

    // ── Los endpoints de siempre no cambian (los usa la app móvil) ────────────

    public function test_el_endpoint_de_entrega_de_siempre_responde_igual_con_folio_entregado(): void
    {
        [$order, $item] = $this->folio();
        $order->update(['status' => PreSaleOrder::STATUS_DELIVERED]);

        $res = $this->actingAs($this->cashier)->patchJson("/api/v1/pre-sale-orders/{$order->id}/status", [
            'status' => 'delivered', 'item_ids' => [$item->id],
        ]);

        $res->assertStatus(422)->assertJsonPath('success', false);
        $this->assertStringContainsString('no está listo para liquidar (estado: delivered)', (string) $res->json('error'));
        $this->assertNull($res->json('errors'), 'el contrato viejo no lleva código');
    }
}
