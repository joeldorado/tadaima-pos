<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Customer;
use App\Models\PreSaleCatalog;
use App\Models\PreSaleOrder;
use App\Models\PreSaleOrderItem;
use App\Models\Product;
use App\Models\Store;
use App\Models\User;
use App\Services\PreSaleOrderService;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Snap-at-creation para items de folio de preventa.
 *
 *  - Si el catálogo está vinculado a Product → snap = products.cost
 *  - Si el catálogo aún no tiene Product (pre-arrival) → snap = catalog.cost
 *  - Mutar products.cost NO re-snapea (el vínculo a Product es historia)
 *  - Editar catalog.cost SÍ re-snapea las partidas ABIERTAS (no entregadas):
 *    en preventa la mercancía no está comprada al crear el folio, así que ese
 *    primer snap suele ser un vacío. Entregar congela el valor definitivo.
 *  - No se puede liquidar ni marcar llegado sin costo MAYOR A 0 (null y 0 igual).
 */
class PreSaleOrderCostSnapshotTest extends TestCase
{
    use RefreshDatabase;

    private PreSaleOrderService $service;
    private User $user;
    private Store $store;
    private Customer $customer;

    protected function setUp(): void
    {
        parent::setUp();
        $this->service = app(PreSaleOrderService::class);
        $company = Company::create(['name' => 'Test Co']);
        $this->store = Store::create(['company_id' => $company->id, 'name' => 'Store']);
        $this->user = User::create([
            'name' => 'C', 'email' => 'c@t.com', 'password' => bcrypt('x'),
            'company_id' => $company->id, 'store_id' => $this->store->id,
        ]);
        $this->customer = Customer::create(['name' => 'Cliente']);
    }

    private function makeCatalog(array $overrides = []): PreSaleCatalog
    {
        $catalog = PreSaleCatalog::create(array_merge([
            'product_name' => 'Item ' . uniqid(),
            'price_1'      => 200.00,
            'status'       => PreSaleCatalog::STATUS_PUBLISHED,
            'created_by'   => $this->user->id,
        ], $overrides));
        $catalog->storeLimits()->create(['store_id' => $this->store->id, 'limit_qty' => 99]);
        return $catalog;
    }

    public function test_item_snaps_cost_from_linked_product_at_creation(): void
    {
        $product = Product::create([
            'company_id' => $this->store->company_id,
            'name' => 'Linked', 'sku' => 'L-' . uniqid(),
            'cost' => 50.00, 'active' => true,
        ]);
        $catalog = $this->makeCatalog(['product_id' => $product->id, 'cost' => 99.00]);

        $order = $this->service->createOrder([
            'store_id'    => $this->store->id,
            'customer_id' => $this->customer->id,
            'items'       => [['catalog_id' => $catalog->id, 'quantity' => 1, 'price_level' => 1]],
        ], $this->user->id);

        $item = $order->items()->first();
        $this->assertSame(50.00, (float) $item->cost,
            'Con product_id vinculado, snap usa products.cost (no catalog.cost)');
    }

    public function test_item_falls_back_to_catalog_cost_when_no_linked_product(): void
    {
        // Catálogo pre-arrival: sin product_id, solo cost del proveedor en data maestra.
        $catalog = $this->makeCatalog(['product_id' => null, 'cost' => 80.00]);

        $order = $this->service->createOrder([
            'store_id'    => $this->store->id,
            'customer_id' => $this->customer->id,
            'items'       => [['catalog_id' => $catalog->id, 'quantity' => 1, 'price_level' => 1]],
        ], $this->user->id);

        $item = $order->items()->first();
        $this->assertSame(80.00, (float) $item->cost,
            'Sin product vinculado, snap usa catalog.cost del proveedor');
    }

    public function test_mutating_product_cost_after_creation_does_not_change_item_cost(): void
    {
        $product = Product::create([
            'company_id' => $this->store->company_id,
            'name' => 'M', 'sku' => 'M-' . uniqid(),
            'cost' => 100.00, 'active' => true,
        ]);
        $catalog = $this->makeCatalog(['product_id' => $product->id]);

        $order = $this->service->createOrder([
            'store_id'    => $this->store->id,
            'customer_id' => $this->customer->id,
            'items'       => [['catalog_id' => $catalog->id, 'quantity' => 1, 'price_level' => 1]],
        ], $this->user->id);

        // Cambio post-creación
        $product->update(['cost' => 500.00]);

        $item = $order->items()->first();
        $this->assertSame(100.00, (float) $item->cost,
            'Mutar products.cost después de crear el folio NO debe afectar el cost del item');
    }

    // ── Re-snap desde el catálogo (etapa 1) ──────────────────────────────────

    private function admin(): User
    {
        $admin = User::create([
            'name' => 'Admin', 'email' => 'a' . uniqid() . '@t.com', 'password' => bcrypt('x'),
            'company_id' => $this->store->company_id, 'store_id' => $this->store->id,
        ]);
        $roleId = \DB::table('roles')->where('name', 'admin')->value('id')
            ?? \DB::table('roles')->insertGetId([
                'name' => 'admin', 'guard_name' => 'api',
                'created_at' => now(), 'updated_at' => now(),
            ]);
        \DB::table('model_has_roles')->insert([
            'role_id' => $roleId, 'model_type' => User::class, 'model_id' => $admin->id,
        ]);
        return $admin;
    }

    private function makeOrder(PreSaleCatalog $catalog): PreSaleOrder
    {
        return $this->service->createOrder([
            'store_id'    => $this->store->id,
            'customer_id' => $this->customer->id,
            'items'       => [['catalog_id' => $catalog->id, 'quantity' => 1, 'price_level' => 1]],
        ], $this->user->id);
    }

    public function test_editing_catalog_cost_resnaps_open_items(): void
    {
        // Folio creado ANTES de capturar el costo → cost NULL (el caso real).
        $catalog = $this->makeCatalog(['product_id' => null, 'cost' => null]);
        $order   = $this->makeOrder($catalog);
        $this->assertNull($order->items()->first()->cost);

        $this->actingAs($this->admin())
            ->patchJson("/api/v1/pre-sale-catalogs/{$catalog->id}", [
                'product_name' => $catalog->product_name,
                'price_1'      => 200.00,
                'cost'         => 120.00,
            ])->assertOk();

        $this->assertSame(120.00, (float) $order->items()->first()->fresh()->cost,
            'Capturar el costo en el catálogo debe bajar a las partidas abiertas');
    }

    public function test_editing_catalog_cost_does_not_touch_delivered_items(): void
    {
        $catalog = $this->makeCatalog(['product_id' => null, 'cost' => 80.00]);
        $order   = $this->makeOrder($catalog);

        $order->items()->update([
            'status'       => PreSaleOrderItem::STATUS_DELIVERED,
            'delivered_at' => now(),
        ]);

        $this->actingAs($this->admin())
            ->patchJson("/api/v1/pre-sale-catalogs/{$catalog->id}", [
                'product_name' => $catalog->product_name,
                'price_1'      => 200.00,
                'cost'         => 999.00,
            ])->assertOk();

        $this->assertSame(80.00, (float) $order->items()->first()->fresh()->cost,
            'Una partida ENTREGADA es historia cerrada: su costo no se re-snapea');
    }

    // ── Candado de liquidación (etapa 2) ─────────────────────────────────────

    private function readyOrder(PreSaleCatalog $catalog): PreSaleOrder
    {
        $order = $this->makeOrder($catalog);
        $catalog->update(['status' => PreSaleCatalog::STATUS_ARRIVED]);
        $order->update(['status' => PreSaleOrder::STATUS_READY]);
        return $order->fresh();
    }

    public function test_liquidate_blocked_when_cost_is_null(): void
    {
        $catalog = $this->makeCatalog(['product_id' => null, 'cost' => null]);
        $order   = $this->readyOrder($catalog);

        $this->expectException(\DomainException::class);
        $this->expectExceptionMessageMatches('/falta capturar el costo real/');
        $this->service->liquidate($order, $this->user->id);
    }

    public function test_liquidate_blocked_when_cost_is_zero(): void
    {
        // Un 0 hace que TODA la venta cuente como utilidad: se trata igual que
        // el vacío. No se distingue "regalo" de "olvido" a propósito.
        $catalog = $this->makeCatalog(['product_id' => null, 'cost' => 0.00]);
        $order   = $this->readyOrder($catalog);

        $this->expectException(\DomainException::class);
        $this->expectExceptionMessageMatches('/falta capturar el costo real/');
        $this->service->liquidate($order, $this->user->id);
    }

    public function test_liquidate_allowed_after_capturing_cost(): void
    {
        $catalog = $this->makeCatalog(['product_id' => null, 'cost' => null]);
        $order   = $this->readyOrder($catalog);

        // El gerente captura el costo al llegar la mercancía → re-snap.
        $this->actingAs($this->admin())
            ->patchJson("/api/v1/pre-sale-catalogs/{$catalog->id}", [
                'product_name' => $catalog->product_name,
                'price_1'      => 200.00,
                'cost'         => 150.00,
            ])->assertOk();

        $updated = $this->service->liquidate($order->fresh(), $this->user->id);

        $this->assertSame(PreSaleOrder::STATUS_DELIVERED, $updated->status);
        $this->assertSame(150.00, (float) $updated->items()->first()->cost,
            'El costo capturado antes de liquidar queda congelado en la partida');
    }

    public function test_deliver_single_item_blocked_when_cost_is_null(): void
    {
        $this->assertDeliverItemBlocked(null);
    }

    public function test_deliver_single_item_blocked_when_cost_is_zero(): void
    {
        $this->assertDeliverItemBlocked(0.00);
    }

    private function assertDeliverItemBlocked(?float $costo): void
    {
        // Segunda puerta de entrega (PATCH items/{id}/deliver): mismo candado.
        $catalog = $this->makeCatalog(['product_id' => null, 'cost' => $costo]);
        $order   = $this->readyOrder($catalog);
        $item    = $order->items()->first();

        $this->actingAs($this->admin())
            ->patchJson("/api/v1/pre-sale-orders/{$order->id}/items/{$item->id}/deliver", [
                'status' => 'delivered',
            ])
            ->assertStatus(422)
            ->assertJsonPath('success', false);

        $this->assertSame(PreSaleOrderItem::STATUS_PENDING, $item->fresh()->status);
    }

    // ── Candado en "Producto llegó" (etapa 3) ────────────────────────────────

    public function test_marking_arrived_blocked_when_catalog_cost_is_null(): void
    {
        $catalog = $this->makeCatalog(['product_id' => null, 'cost' => null]);

        $this->actingAs($this->admin())
            ->patchJson("/api/v1/pre-sale-catalogs/{$catalog->id}/status", ['status' => 'arrived'])
            ->assertStatus(422)
            ->assertJsonPath('success', false);

        $this->assertSame(PreSaleCatalog::STATUS_PUBLISHED, $catalog->fresh()->status,
            'Sin costo capturado el catálogo NO debe pasar a llegado');
    }

    public function test_marking_arrived_blocked_when_cost_is_zero(): void
    {
        $catalog = $this->makeCatalog(['product_id' => null, 'cost' => 0.00]);

        $this->actingAs($this->admin())
            ->patchJson("/api/v1/pre-sale-catalogs/{$catalog->id}/status", ['status' => 'arrived'])
            ->assertStatus(422)
            ->assertJsonPath('success', false);

        $this->assertSame(PreSaleCatalog::STATUS_PUBLISHED, $catalog->fresh()->status,
            'Costo 0 se trata igual que sin costo: NO debe pasar a llegado');
    }

    public function test_has_real_cost_flag_visible_without_cost_permission(): void
    {
        // Un gerente SIN can_view_cost recibe cost=null aunque el catálogo sí lo
        // tenga. has_real_cost debe seguir diciendo la verdad, o la UI marcaría
        // "falta el costo" en falso y le bloquearía marcar llegado.
        $catalog = $this->makeCatalog(['product_id' => null, 'cost' => 300.00]);

        $gerente = User::create([
            'name' => 'Gerente', 'email' => 'g' . uniqid() . '@t.com', 'password' => bcrypt('x'),
            'company_id' => $this->store->company_id, 'store_id' => $this->store->id,
            'can_view_cost' => false,
        ]);
        $roleId = \DB::table('roles')->where('name', 'gerente')->value('id')
            ?? \DB::table('roles')->insertGetId([
                'name' => 'gerente', 'guard_name' => 'api',
                'created_at' => now(), 'updated_at' => now(),
            ]);
        \DB::table('model_has_roles')->insert([
            'role_id' => $roleId, 'model_type' => User::class, 'model_id' => $gerente->id,
        ]);

        $this->actingAs($gerente)
            ->getJson("/api/v1/pre-sale-catalogs/{$catalog->id}")
            ->assertOk()
            ->assertJsonPath('data.cost', null)          // el monto sigue oculto
            ->assertJsonPath('data.has_real_cost', true); // pero el flag no miente

        // Y puede marcar llegado sin ver el monto.
        $this->actingAs($gerente)
            ->patchJson("/api/v1/pre-sale-catalogs/{$catalog->id}/status", ['status' => 'arrived'])
            ->assertOk();
    }

    public function test_has_real_cost_is_false_when_cost_is_zero_or_null(): void
    {
        foreach ([null, 0.00] as $costo) {
            $catalog = $this->makeCatalog(['product_id' => null, 'cost' => $costo]);
            $this->actingAs($this->admin())
                ->getJson("/api/v1/pre-sale-catalogs/{$catalog->id}")
                ->assertOk()
                ->assertJsonPath('data.has_real_cost', false);
        }
    }

    public function test_order_item_exposes_has_real_cost_without_leaking_amount(): void
    {
        // Caja: el cajero NO ve el monto del costo, pero sí necesita saber si
        // existe para no cargar a liquidar una partida sin costo real.
        $catalog = $this->makeCatalog(['product_id' => null, 'cost' => 300.00]);
        $order   = $this->makeOrder($catalog);

        $cajero = User::create([
            'name' => 'Cajero', 'email' => 'k' . uniqid() . '@t.com', 'password' => bcrypt('x'),
            'company_id' => $this->store->company_id, 'store_id' => $this->store->id,
            'can_view_cost' => false,
        ]);

        $this->actingAs($cajero)
            ->getJson("/api/v1/pre-sale-orders/{$order->id}")
            ->assertOk()
            ->assertJsonPath('data.items.0.cost', null)           // monto oculto
            ->assertJsonPath('data.items.0.has_real_cost', true); // flag honesto
    }

    public function test_marking_arrived_allowed_after_capturing_cost(): void
    {
        $catalog = $this->makeCatalog(['product_id' => null, 'cost' => null]);
        $order   = $this->makeOrder($catalog);

        $this->actingAs($this->admin())
            ->patchJson("/api/v1/pre-sale-catalogs/{$catalog->id}", [
                'product_name' => $catalog->product_name,
                'price_1'      => 200.00,
                'cost'         => 250.00,
            ])->assertOk();

        $this->actingAs($this->admin())
            ->patchJson("/api/v1/pre-sale-catalogs/{$catalog->id}/status", ['status' => 'arrived'])
            ->assertOk();

        $this->assertSame(PreSaleCatalog::STATUS_ARRIVED, $catalog->fresh()->status);
        // El folio pasa a listo YA con el costo puesto — nunca arrastra un vacío.
        $this->assertSame(PreSaleOrder::STATUS_READY, $order->fresh()->status);
        $this->assertSame(250.00, (float) $order->items()->first()->fresh()->cost);
    }
}
