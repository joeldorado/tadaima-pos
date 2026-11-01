<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\CashRegister;
use App\Models\CashRegisterSession;
use App\Models\Company;
use App\Models\Inventory;
use App\Models\PaymentMethod;
use App\Models\Product;
use App\Models\ProductPromotion;
use App\Models\Sale;
use App\Models\SaleCancellation;
use App\Models\SaleGift;
use App\Models\SaleItem;
use App\Models\Store;
use App\Models\User;
use App\Models\Warehouse;
use App\Support\DateRange;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Regalo por línea en Caja (2026-10-31, pedido del cliente: «Botón de Regalo»).
 *
 * La línea regalo viaja con el precio de CATÁLOGO + `is_gift` (el guard de
 * precios la valida igual). Se guarda en sale_items con price = total = cost = 0
 * para que ningún reporte la cuente como venta ni como costo; products.cost no
 * cambia. Lo que se regaló (precio de catálogo, costo real, nota, quién) queda
 * en sale_gifts. El stock sí se descuenta.
 */
class GiftLineCheckoutTest extends TestCase
{
    use RefreshDatabase;

    private User $user;
    private Store $store;
    private Warehouse $warehouse;
    private CashRegisterSession $session;
    private PaymentMethod $cashMethod;

    protected function setUp(): void
    {
        parent::setUp();

        $company = Company::create(['name' => 'Test Co']);
        $this->store = Store::create(['company_id' => $company->id, 'name' => 'Test Store']);
        $this->user = User::create([
            'name' => 'Cajero', 'email' => 'cajero@test.com', 'password' => bcrypt('x'),
            'company_id' => $company->id, 'store_id' => $this->store->id,
        ]);
        $this->warehouse = Warehouse::create([
            'company_id' => $company->id, 'store_id' => $this->store->id,
            'name' => 'Exhibición', 'type' => 'store', 'active' => true,
        ]);
        $register = CashRegister::create(['store_id' => $this->store->id, 'name' => 'Caja 1', 'active' => true]);
        $this->session = CashRegisterSession::create([
            'register_id' => $register->id, 'user_id' => $this->user->id,
            'opening_cash' => 0, 'status' => 'open', 'opened_at' => now(),
        ]);
        $this->cashMethod = PaymentMethod::firstOrCreate(['name' => 'Efectivo'], ['active' => true]);
    }

    private function makeProduct(float $price, float $cost = 40): Product
    {
        $product = Product::create([
            'company_id' => $this->store->company_id,
            'name' => 'Producto ' . uniqid(), 'sku' => 'SKU-' . uniqid(),
            'cost' => $cost, 'active' => true,
        ]);
        $product->price()->create(['price_1' => $price]);
        Inventory::create(['product_id' => $product->id, 'warehouse_id' => $this->warehouse->id, 'quantity' => 10]);

        return $product;
    }

    private function checkout(array $items, float $paymentAmount, array $extra = []): \Illuminate\Testing\TestResponse
    {
        return $this->actingAs($this->user)->postJson('/api/v1/sales', array_merge([
            'store_id'            => $this->store->id,
            'register_session_id' => $this->session->id,
            'calc_version'        => 2,
            'items'               => $items,
            'payments'            => [['payment_method_id' => $this->cashMethod->id, 'amount' => $paymentAmount]],
        ], $extra));
    }

    private function stockOf(Product $product): float
    {
        return (float) Inventory::where('product_id', $product->id)->value('quantity');
    }

    public function test_el_regalo_queda_en_cero_y_el_costo_del_producto_no_cambia(): void
    {
        $paid = $this->makeProduct(200);
        $gift = $this->makeProduct(150, 60);

        $res = $this->checkout([
            ['product_id' => $paid->id, 'quantity' => 1, 'price' => 200],
            ['product_id' => $gift->id, 'quantity' => 2, 'price' => 150, 'is_gift' => true, 'gift_note' => '  cliente frecuente '],
        ], 200);

        $res->assertStatus(201)
            ->assertJsonPath('data.items.1.is_gift', true)
            ->assertJsonPath('data.items.1.gift.list_price', 150)
            ->assertJsonPath('data.items.1.gift.note', 'cliente frecuente')
            ->assertJsonPath('data.items.0.is_gift', false);
        $this->assertEqualsWithDelta(200.0, (float) $res->json('data.subtotal'), 0.001);
        $this->assertEqualsWithDelta(200.0, (float) $res->json('data.total'), 0.001);

        $line = SaleItem::where('product_id', $gift->id)->first();
        $this->assertSame(0.0, $line->price);
        $this->assertSame(0.0, $line->total);
        $this->assertSame(0.0, $line->cost);
        $this->assertSame(60.0, (float) $gift->fresh()->cost);

        $saleGift = SaleGift::first();
        $this->assertSame($line->id, $saleGift->sale_item_id);
        $this->assertSame(2.0, $saleGift->quantity);
        $this->assertSame(150.0, $saleGift->list_price);
        $this->assertSame(60.0, $saleGift->unit_cost);
        $this->assertSame($this->user->id, (int) $saleGift->authorized_by);
        $this->assertSame($this->store->id, (int) $saleGift->store_id);

        $this->assertSame(8.0, $this->stockOf($gift));
    }

    public function test_el_precio_de_catalogo_se_valida_aunque_sea_regalo(): void
    {
        $gift = $this->makeProduct(150);

        $this->checkout([
            ['product_id' => $gift->id, 'quantity' => 1, 'price' => 1, 'is_gift' => true],
        ], 0)->assertStatus(422);
    }

    public function test_venta_cien_por_ciento_regalo_se_cobra_con_pago_de_cero(): void
    {
        $gift = $this->makeProduct(150);

        $res = $this->checkout([
            ['product_id' => $gift->id, 'quantity' => 1, 'price' => 150, 'is_gift' => true],
        ], 0);

        $res->assertStatus(201);
        $this->assertEqualsWithDelta(0.0, (float) $res->json('data.total'), 0.001);
        $this->assertSame(Sale::STATUS_COMPLETED, Sale::first()->status);
        $this->assertSame(9.0, $this->stockOf($gift));
    }

    public function test_un_pago_de_cero_no_se_acepta_si_hay_algo_que_cobrar(): void
    {
        $paid = $this->makeProduct(200);

        $this->checkout([
            ['product_id' => $paid->id, 'quantity' => 1, 'price' => 200],
        ], 200, ['payments' => [
            ['payment_method_id' => $this->cashMethod->id, 'amount' => 200],
            ['payment_method_id' => $this->cashMethod->id, 'amount' => 0],
        ]])->assertStatus(422);
    }

    public function test_el_regalo_no_se_come_la_pieza_gratis_del_2x1(): void
    {
        $a = $this->makeProduct(200);
        $promo = ProductPromotion::create(['name' => '2x1', 'buy_n' => 2, 'pay_m' => 1]);
        $promo->products()->syncWithoutDetaching([$a->id]);

        // 2 pagadas en 2x1 + 1 regalada del mismo producto: el 2x1 sigue
        // aplicando a las pagadas (sin el regalo dentro del pool).
        $this->checkout([
            ['product_id' => $a->id, 'quantity' => 2, 'price' => 200],
            ['product_id' => $a->id, 'quantity' => 1, 'price' => 200, 'is_gift' => true],
        ], 200)
            ->assertStatus(201)
            ->assertJsonPath('data.discount', 200)
            ->assertJsonPath('data.total', 200)
            ->assertJsonPath('data.items.1.promo_name', null);
    }

    public function test_regalo_con_descuento_o_aumento_se_rechaza(): void
    {
        $gift = $this->makeProduct(150);

        $this->checkout([[
            'product_id' => $gift->id, 'quantity' => 1, 'price' => 150, 'is_gift' => true,
            'line_discount' => ['kind' => 'percent', 'basis' => 'line', 'value' => 10, 'reason' => 'otro'],
        ]], 0)->assertStatus(422)->assertJsonValidationErrors(['items.0.is_gift']);
    }

    public function test_sin_calc_version_el_regalo_se_rechaza(): void
    {
        // App móvil (ruta legacy): sin calc_version las columnas por línea no se
        // llenan, así que el regalo no se acepta en silencio.
        $gift = $this->makeProduct(150);

        $this->checkout([
            ['product_id' => $gift->id, 'quantity' => 1, 'price' => 150, 'is_gift' => true],
        ], 150, ['calc_version' => null])->assertStatus(422);
    }

    public function test_un_regalo_solo_efectivo_no_bloquea_tarjeta_en_el_resto(): void
    {
        $card = PaymentMethod::firstOrCreate(['name' => 'Tarjeta Débito'], ['active' => true]);
        $paid = $this->makeProduct(200);
        $gift = $this->makeProduct(150);
        $gift->paymentMethod()->create(['allow_cash' => true, 'allow_card' => false]);

        $this->checkout([
            ['product_id' => $paid->id, 'quantity' => 1, 'price' => 200],
            ['product_id' => $gift->id, 'quantity' => 1, 'price' => 150, 'is_gift' => true],
        ], 200, ['payments' => [['payment_method_id' => $card->id, 'amount' => 200]]])
            ->assertStatus(201);
    }

    public function test_cancelar_lo_pagado_deja_la_venta_parcial_con_el_regalo(): void
    {
        $paid = $this->makeProduct(200);
        $gift = $this->makeProduct(150);

        $sale = Sale::find($this->checkout([
            ['product_id' => $paid->id, 'quantity' => 1, 'price' => 200],
            ['product_id' => $gift->id, 'quantity' => 2, 'price' => 150, 'is_gift' => true],
        ], 200)->assertStatus(201)->json('data.id'));

        $paidLine = SaleItem::where('product_id', $paid->id)->first();
        $giftLine = SaleItem::where('product_id', $gift->id)->first();

        $this->actingAs($this->user)->postJson("/api/v1/sales/{$sale->id}/cancel", [
            'items'           => [['sale_item_id' => $paidLine->id, 'quantity' => 1]],
            'reason_code'     => 'cliente_devuelve',
            'cash_session_id' => $this->session->id,
        ])->assertOk();

        $sale->refresh();
        $this->assertSame(Sale::CANCELLATION_PARTIAL, $sale->cancellation_status);
        $this->assertSame(Sale::STATUS_COMPLETED, $sale->status);

        // Después se cancela 1 de las 2 piezas regaladas: el detalle se ajusta
        // y el snapshot lo marca como regalo.
        $this->actingAs($this->user)->postJson("/api/v1/sales/{$sale->id}/cancel", [
            'items'           => [['sale_item_id' => $giftLine->id, 'quantity' => 1]],
            'reason_code'     => 'cliente_devuelve',
            'cash_session_id' => $this->session->id,
        ])->assertOk();

        $this->assertSame(1.0, SaleGift::first()->quantity);
        $snapshot = SaleCancellation::latest('id')->first()->items_snapshot;
        $this->assertTrue($snapshot[0]['is_gift']);
        $this->assertEqualsWithDelta(0.0, (float) SaleCancellation::latest('id')->first()->amount_refunded, 0.001);
        $this->assertSame(9.0, $this->stockOf($gift));
    }

    public function test_top_products_separa_el_renglon_del_regalo(): void
    {
        $a = $this->makeProduct(200);

        $this->checkout([
            ['product_id' => $a->id, 'quantity' => 1, 'price' => 200],
            ['product_id' => $a->id, 'quantity' => 1, 'price' => 200, 'is_gift' => true],
        ], 200)->assertStatus(201);

        $today = now(DateRange::timezone())->toDateString();
        $rows = collect($this->actingAs($this->user)
            ->getJson("/api/v1/reports/top-products?from={$today}&to={$today}")
            ->assertOk()
            ->json('data.data'));

        $this->assertCount(2, $rows);
        $giftRow = $rows->firstWhere('is_gift', true);
        $this->assertEqualsWithDelta(0.0, (float) $giftRow['total_revenue'], 0.001);
        $this->assertEqualsWithDelta(1.0, (float) $giftRow['total_quantity'], 0.001);
        $this->assertEqualsWithDelta(200.0, (float) $rows->firstWhere('is_gift', false)['total_revenue'], 0.001);
    }
}
