<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\CashRegister;
use App\Models\CashRegisterSession;
use App\Models\Company;
use App\Models\Inventory;
use App\Models\PaymentMethod;
use App\Models\Product;
use App\Models\SaleItem;
use App\Models\Store;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Comentario por línea en Caja (2026-10-03, pedido de las tiendas vía Joel).
 *
 * El cajero anota un texto corto en la línea desde el menú ⋮ ("para la promo",
 * "regalo", "lo recoge Juan"). Es un recordatorio interno: viaja en
 * `items.*.comment`, se guarda en `sale_items.comment` y se ve junto al nombre
 * en Caja y en Ventas. NO cambia montos ni se imprime en el ticket.
 */
class LineCommentCheckoutTest extends TestCase
{
    use RefreshDatabase;

    private User $user;
    private Store $store;
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
        Warehouse::create([
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

    private function makeProduct(float $price): Product
    {
        $warehouse = Warehouse::where('store_id', $this->store->id)->first();
        $product = Product::create([
            'company_id' => $this->store->company_id,
            'name' => 'Producto ' . uniqid(), 'sku' => 'SKU-' . uniqid(),
            'cost' => 40, 'active' => true,
        ]);
        $product->price()->create(['price_1' => $price]);
        Inventory::create(['product_id' => $product->id, 'warehouse_id' => $warehouse->id, 'quantity' => 100]);

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

    public function test_el_comentario_se_guarda_en_la_linea_y_regresa_en_la_venta(): void
    {
        $product = $this->makeProduct(200);

        $res = $this->checkout([
            ['product_id' => $product->id, 'quantity' => 1, 'price' => 200, 'comment' => '  para la promo  '],
        ], 200);

        $res->assertStatus(201)
            ->assertJsonPath('data.items.0.comment', 'para la promo');
        $this->assertSame('para la promo', SaleItem::first()->comment);
    }

    public function test_el_comentario_no_cambia_los_montos(): void
    {
        $product = $this->makeProduct(200);

        $res = $this->checkout([
            ['product_id' => $product->id, 'quantity' => 2, 'price' => 200, 'comment' => 'regalo'],
        ], 400);

        $res->assertStatus(201);
        $this->assertEqualsWithDelta(400.0, (float) $res->json('data.subtotal'), 0.001);
        $this->assertEqualsWithDelta(400.0, (float) $res->json('data.total'), 0.001);
        $this->assertEqualsWithDelta(0.0, (float) $res->json('data.discount'), 0.001);
    }

    public function test_sin_comentario_o_en_blanco_queda_null(): void
    {
        $product = $this->makeProduct(100);

        $this->checkout([
            ['product_id' => $product->id, 'quantity' => 1, 'price' => 100],
            ['product_id' => $product->id, 'quantity' => 1, 'price' => 100, 'comment' => '   '],
        ], 200)->assertStatus(201);

        $this->assertSame([null, null], SaleItem::orderBy('id')->pluck('comment')->all());
    }

    public function test_cada_linea_guarda_su_propio_comentario(): void
    {
        $a = $this->makeProduct(100);
        $b = $this->makeProduct(50);

        $this->checkout([
            ['product_id' => $a->id, 'quantity' => 1, 'price' => 100],
            ['product_id' => $b->id, 'quantity' => 1, 'price' => 50, 'comment' => 'lo recoge Juan'],
        ], 150)->assertStatus(201);

        $this->assertNull(SaleItem::where('product_id', $a->id)->value('comment'));
        $this->assertSame('lo recoge Juan', SaleItem::where('product_id', $b->id)->value('comment'));
    }

    public function test_un_comentario_demasiado_largo_se_rechaza(): void
    {
        $product = $this->makeProduct(100);

        $this->checkout([
            ['product_id' => $product->id, 'quantity' => 1, 'price' => 100, 'comment' => str_repeat('a', SaleItem::COMMENT_MAX + 1)],
        ], 100)->assertStatus(422);

        $this->checkout([
            ['product_id' => $product->id, 'quantity' => 1, 'price' => 100, 'comment' => str_repeat('a', SaleItem::COMMENT_MAX)],
        ], 100)->assertStatus(201);
    }

    public function test_el_comentario_exige_calc_version_2(): void
    {
        // Sin v2 las columnas por línea no se llenan: el comentario se perdería
        // en silencio, así que se rechaza (igual que el aumento por línea).
        $product = $this->makeProduct(100);

        $this->actingAs($this->user)->postJson('/api/v1/sales', [
            'store_id'            => $this->store->id,
            'register_session_id' => $this->session->id,
            'items'               => [['product_id' => $product->id, 'quantity' => 1, 'price' => 100, 'comment' => 'x']],
            'payments'            => [['payment_method_id' => $this->cashMethod->id, 'amount' => 100]],
        ])->assertStatus(422);
    }
}
