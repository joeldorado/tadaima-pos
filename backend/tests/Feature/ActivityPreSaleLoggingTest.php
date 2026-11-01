<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Customer;
use App\Models\PreSaleCatalog;
use App\Models\PreSaleOrder;
use App\Models\PreSaleOrderItem;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Huecos de auditoría de preventas tapados el 2026-11-01: crear/editar un
 * catálogo (costo, cupos, límite por cliente), cambiarle el estado, el paso
 * masivo de folios a "listo" al marcar "llegó" y la entrega de una partida
 * suelta no dejaban rastro de quién lo hizo.
 */
class ActivityPreSaleLoggingTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private Customer $customer;
    private Store $storeA;
    private Store $storeB;

    protected function setUp(): void
    {
        parent::setUp();

        $company      = Company::create(['name' => 'Test Company']);
        $this->storeA = Store::create(['company_id' => $company->id, 'name' => 'Centro']);
        $this->storeB = Store::create(['company_id' => $company->id, 'name' => 'Macro']);
        $this->admin  = User::create([
            'name' => 'Admin', 'email' => 'admin@test.com', 'password' => bcrypt('password'),
            'company_id' => $company->id, 'store_id' => $this->storeA->id,
        ]);
        $this->customer = Customer::create(['name' => 'Cliente de prueba']);
        $roleId = DB::table('roles')->insertGetId(['name' => 'admin', 'guard_name' => 'api', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('model_has_roles')->insert(['role_id' => $roleId, 'model_type' => User::class, 'model_id' => $this->admin->id]);
    }

    private function logs(string $action): \Illuminate\Support\Collection
    {
        return DB::table('system_logs')->where('action', $action)->orderBy('id')->get()
            ->map(fn ($row) => ['row' => $row, 'meta' => json_decode((string) $row->meta, true)]);
    }

    private function makeCatalog(array $overrides = []): PreSaleCatalog
    {
        return PreSaleCatalog::create(array_merge([
            'product_name' => 'Booster Box Delta', 'price_1' => 2800, 'cost' => 2151,
            'status' => PreSaleCatalog::STATUS_PUBLISHED, 'created_by' => $this->admin->id,
        ], $overrides));
    }

    private function makeOrder(PreSaleCatalog $catalog, int $qty = 1): PreSaleOrder
    {
        $order = PreSaleOrder::create([
            'code' => 'PREV-' . str_pad((string) random_int(1, 99999), 5, '0', STR_PAD_LEFT),
            'store_id' => $this->storeA->id, 'user_id' => $this->admin->id, 'customer_id' => $this->customer->id,
            'status' => PreSaleOrder::STATUS_PENDING,
        ]);
        PreSaleOrderItem::create([
            'pre_sale_order_id' => $order->id, 'pre_sale_catalog_id' => $catalog->id,
            'quantity' => $qty, 'price_level' => 1, 'unit_price' => 2800, 'cost' => 2151, 'status' => 'pending',
        ]);
        return $order;
    }

    public function test_crear_catalogo_deja_log_con_cupos_y_costo(): void
    {
        $this->actingAs($this->admin)->postJson('/api/v1/pre-sale-catalogs', [
            'product_name' => 'ETB Delta Reign', 'price_1' => 1100, 'cost' => 657, 'limit_per_customer' => 1,
            'store_limits' => [['store_id' => $this->storeA->id, 'limit_qty' => 23], ['store_id' => $this->storeB->id, 'limit_qty' => 20]],
        ])->assertOk();

        $logs = $this->logs('pre_sale_catalog.created');
        $this->assertCount(1, $logs);
        $this->assertSame($this->admin->id, (int) $logs[0]['row']->user_id);
        $this->assertSame('pre_sale_catalog', $logs[0]['row']->entity_type);
        $this->assertStringContainsString('ETB Delta Reign', $logs[0]['row']->description);
        $this->assertSame(657.0, (float) $logs[0]['meta']['cost']);
        $this->assertSame(1, $logs[0]['meta']['limit_per_customer']);
        $this->assertSame([(string) $this->storeA->id => 23, (string) $this->storeB->id => 20], $logs[0]['meta']['store_limits']);
    }

    public function test_editar_cupos_y_costo_deja_antes_y_despues(): void
    {
        $catalog = $this->makeCatalog();
        $catalog->storeLimits()->create(['store_id' => $this->storeA->id, 'limit_qty' => 12]);
        $catalog->storeLimits()->create(['store_id' => $this->storeB->id, 'limit_qty' => 8]);

        $this->actingAs($this->admin)->patchJson("/api/v1/pre-sale-catalogs/{$catalog->id}", [
            'cost' => 2200,
            'store_limits' => [['store_id' => $this->storeA->id, 'limit_qty' => 12], ['store_id' => $this->storeB->id, 'limit_qty' => 10]],
        ])->assertOk();

        $logs = $this->logs('pre_sale_catalog.updated');
        $this->assertCount(1, $logs);
        $meta = $logs[0]['meta'];
        $this->assertSame(['from' => 2151, 'to' => 2200], array_map('intval', $meta['changes']['cost']));
        $this->assertArrayNotHasKey('price_1', $meta['changes']);
        // Solo la tienda que cambió; Centro quedó igual y no aparece.
        $this->assertSame([(string) $this->storeB->id => ['from' => 8, 'to' => 10]], $meta['store_limits']);
    }

    public function test_editar_sin_cambio_real_no_deja_log(): void
    {
        $catalog = $this->makeCatalog();
        $catalog->storeLimits()->create(['store_id' => $this->storeA->id, 'limit_qty' => 12]);

        $this->actingAs($this->admin)->patchJson("/api/v1/pre-sale-catalogs/{$catalog->id}", [
            'cost' => 2151,
            'store_limits' => [['store_id' => $this->storeA->id, 'limit_qty' => 12]],
        ])->assertOk();

        $this->assertCount(0, $this->logs('pre_sale_catalog.updated'));
    }

    public function test_marcar_llegado_deja_log_del_catalogo_y_log_por_folio(): void
    {
        $catalog = $this->makeCatalog();
        $o1 = $this->makeOrder($catalog);
        $o2 = $this->makeOrder($catalog);

        $this->actingAs($this->admin)
            ->patchJson("/api/v1/pre-sale-catalogs/{$catalog->id}/status", ['status' => PreSaleCatalog::STATUS_ARRIVED])
            ->assertOk();

        $logs = $this->logs('pre_sale_catalog.status_changed');
        $this->assertCount(1, $logs);
        $this->assertSame('published', $logs[0]['meta']['from']);
        $this->assertSame('arrived', $logs[0]['meta']['to']);
        $this->assertEqualsCanonicalizing([$o1->id, $o2->id], $logs[0]['meta']['orders_ready']);

        foreach ([$o1, $o2] as $order) {
            $this->assertSame('ready', $order->fresh()->status);
            $folioLog = DB::table('pre_sale_order_logs')->where('pre_sale_order_id', $order->id)->where('to_status', 'ready')->first();
            $this->assertNotNull($folioLog, "Folio {$order->id} sin log de paso a listo");
            $this->assertSame('pending', $folioLog->from_status);
            $this->assertSame($this->admin->id, (int) $folioLog->user_id);
        }
    }

    public function test_cerrar_catalogo_deja_log_sin_folios(): void
    {
        $catalog = $this->makeCatalog();

        $this->actingAs($this->admin)
            ->patchJson("/api/v1/pre-sale-catalogs/{$catalog->id}/status", ['status' => PreSaleCatalog::STATUS_CLOSED])
            ->assertOk();

        $logs = $this->logs('pre_sale_catalog.status_changed');
        $this->assertCount(1, $logs);
        $this->assertSame('closed', $logs[0]['meta']['to']);
        $this->assertSame([], $logs[0]['meta']['orders_ready']);
    }

    public function test_entregar_partida_suelta_deja_log(): void
    {
        $catalog = $this->makeCatalog(['status' => PreSaleCatalog::STATUS_ARRIVED]);
        $order   = $this->makeOrder($catalog, 2);
        $order->update(['status' => PreSaleOrder::STATUS_READY]);
        $item = $order->items()->first();

        $this->actingAs($this->admin)
            ->patchJson("/api/v1/pre-sale-orders/{$order->id}/items/{$item->id}/deliver", ['status' => 'delivered'])
            ->assertOk();

        $logs = $this->logs('pre_sale_order_item.delivered');
        $this->assertCount(1, $logs);
        $this->assertSame('pre_sale_order', $logs[0]['row']->entity_type);
        $this->assertSame($order->id, (int) $logs[0]['row']->entity_id);
        $this->assertSame($item->id, $logs[0]['meta']['item_id']);
        $this->assertSame(2, $logs[0]['meta']['quantity']);
        $this->assertSame('Booster Box Delta', $logs[0]['meta']['product_name']);
        $this->assertStringContainsString($order->code, $logs[0]['row']->description);

        // Revertir la entrega también deja rastro.
        $this->actingAs($this->admin)
            ->patchJson("/api/v1/pre-sale-orders/{$order->id}/items/{$item->id}/deliver", ['status' => 'pending'])
            ->assertOk();
        $this->assertCount(1, $this->logs('pre_sale_order_item.reverted'));
    }
}
