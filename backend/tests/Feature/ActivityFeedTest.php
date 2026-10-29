<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Company;
use App\Models\InventoryMovement;
use App\Models\Product;
use App\Models\Store;
use App\Models\SystemLog;
use App\Models\User;
use App\Models\Warehouse;
use Carbon\Carbon;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Feed de Actividad (solo admin): mezcla inventory_movements + system_logs.
 *
 * Mundo: tienda A (exhA) y B (exhB); P1 producto, P2 tomo; admin, gerente,
 * cajero. Reloj congelado el 2026-10-29 18:00Z (11:00 Tijuana, PDT = UTC-7).
 *
 *  Visibles por default (sin ruido), más reciente primero:
 *   l5 sale.cancelled            2026-10-28 23:00Z  admin
 *   m2 venta P1 exhA VENTA-5     2026-10-28 21:00Z  cajero
 *   l1 product.updated P1        2026-10-28 20:30Z  admin
 *   m1 ajuste P1 exhA 10→8       2026-10-28 20:00Z  cajero
 *   m5 entrada P1 exhA +5        2026-10-28 06:30Z  admin   (= 27-oct 23:30 Tijuana)
 *   m4 transferencia P2 PAQ-99   2026-10-27 15:00Z  admin   (grupo paquete)
 *   l4 product.deleted #9999     2026-10-26 12:00Z  admin   (snapshot)
 *   l6 products.import (desconocida) 2026-10-25 12:00Z  sin usuario (sistema)
 *  Ruido:
 *   m3 ajuste P2 exhB 0→0        2026-10-28 22:00Z  admin
 *   l2 inventory.adjusted P1     2026-10-28 20:00:01Z cajero (duplica m1)
 *   l3 qz_print_ok               2026-10-28 19:00Z  cajero
 */
class ActivityFeedTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;

    private Store $storeA;

    private Store $storeB;

    private Warehouse $exhA;

    private Warehouse $exhB;

    private User $admin;

    private User $gerente;

    private User $cajero;

    private Product $p1;

    private Product $p2;

    protected function setUp(): void
    {
        parent::setUp();
        Carbon::setTestNow(Carbon::parse('2026-10-29 18:00:00', 'UTC'));

        $this->company = Company::create(['name' => 'Tadaima Test']);
        $this->storeA = Store::create(['company_id' => $this->company->id, 'name' => 'Centro', 'active' => true]);
        $this->storeB = Store::create(['company_id' => $this->company->id, 'name' => 'Macro', 'active' => true]);
        $this->exhA = Warehouse::create(['company_id' => $this->company->id, 'store_id' => $this->storeA->id, 'name' => 'Exhibición Centro', 'type' => 'store', 'active' => true]);
        $this->exhB = Warehouse::create(['company_id' => $this->company->id, 'store_id' => $this->storeB->id, 'name' => 'Exhibición Macro', 'type' => 'store', 'active' => true]);

        $this->admin = $this->makeUser('admin@test.com', 'admin');
        $this->gerente = $this->makeUser('gerente@test.com', 'gerente');
        $this->cajero = $this->makeUser('cajero@test.com', 'cajero');

        $this->p1 = Product::create(['name' => 'Booster YGO', 'sku' => 'YGO-001', 'barcode' => '4012927191972', 'active' => true, 'product_type' => Product::TYPE_PRODUCT]);
        $this->p2 = Product::create(['name' => 'Tomo 1 Naruto', 'sku' => 'NAR-001', 'active' => true, 'product_type' => Product::TYPE_MANGA]);

        $this->seedEvents();
    }

    protected function tearDown(): void
    {
        Carbon::setTestNow();
        parent::tearDown();
    }

    private function makeUser(string $email, string $roleName): User
    {
        $user = User::create([
            'name' => ucfirst(explode('@', $email)[0]), 'email' => $email, 'password' => bcrypt('password'),
            'company_id' => $this->company->id, 'store_id' => $this->storeA->id, 'active' => true,
        ]);
        $roleId = DB::table('roles')->where('name', $roleName)->value('id')
            ?? DB::table('roles')->insertGetId(['name' => $roleName, 'guard_name' => 'api', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('model_has_roles')->insert(['role_id' => $roleId, 'model_type' => User::class, 'model_id' => $user->id]);

        return $user;
    }

    private function mov(Product $p, Warehouse $w, string $type, float $qty, User $u, string $at, ?string $ref = null, ?string $notes = null): InventoryMovement
    {
        return InventoryMovement::forceCreate([
            'product_id' => $p->id, 'warehouse_id' => $w->id, 'type' => $type, 'quantity' => $qty,
            'reference' => $ref, 'notes' => $notes, 'user_id' => $u->id,
            'created_at' => Carbon::parse($at, 'UTC'),
        ]);
    }

    private function log(string $action, ?User $u, string $at, ?string $entityType = null, ?int $entityId = null, ?array $meta = null, ?string $description = null): SystemLog
    {
        return SystemLog::forceCreate([
            'user_id' => $u?->id, 'action' => $action, 'entity_type' => $entityType, 'entity_id' => $entityId,
            'description' => $description, 'meta' => $meta, 'created_at' => Carbon::parse($at, 'UTC'),
        ]);
    }

    private function seedEvents(): void
    {
        $this->mov($this->p1, $this->exhA, 'ajuste', -2, $this->cajero, '2026-10-28 20:00:00', null, 'Ajuste manual: 10 → 8');
        $this->mov($this->p1, $this->exhA, 'venta', 1, $this->cajero, '2026-10-28 21:00:00', 'VENTA-5');
        $this->mov($this->p2, $this->exhB, 'ajuste', 0, $this->admin, '2026-10-28 22:00:00', null, 'Ajuste manual: 0 → 0');
        $this->mov($this->p2, $this->exhB, 'transferencia', 3, $this->admin, '2026-10-27 15:00:00', 'PAQ-99', 'Armado de paquete');
        $this->mov($this->p1, $this->exhA, 'entrada', 5, $this->admin, '2026-10-28 06:30:00');

        $this->log('product.updated', $this->admin, '2026-10-28 20:30:00', 'product', $this->p1->id,
            ['changes' => ['name' => ['old' => 'Booster ygo', 'new' => 'Booster YGO'], 'prices.price_1' => ['old' => 100, 'new' => 120]]],
            'Producto editado: Booster YGO (SKU: YGO-001)');
        $this->log('inventory.adjusted', $this->cajero, '2026-10-28 20:00:01', 'inventory', $this->p1->id,
            ['product_id' => $this->p1->id, 'warehouse_id' => $this->exhA->id, 'old' => 10, 'new' => 8, 'delta' => -2],
            'Stock ajustado: Booster YGO en Exhibición Centro: 10 → 8');
        $this->log('qz_print_ok', $this->cajero, '2026-10-28 19:00:00', null, null, null, 'Ticket impreso');
        $this->log('product.deleted', $this->admin, '2026-10-26 12:00:00', 'product', 9999,
            ['mode' => 'soft', 'snapshot' => ['id' => 9999, 'name' => 'Borrado X', 'sku' => 'BX-1']],
            'Producto eliminado: Borrado X (SKU: BX-1)');
        $this->log('sale.cancelled', $this->admin, '2026-10-28 23:00:00', 'sale', 1,
            ['mode' => 'full', 'reason_code' => 'error_cajero', 'amount_refunded' => 300], 'Venta #1 cancelada (full)');
        $this->log('products.import', null, '2026-10-25 12:00:00', 'product', null, ['rows' => 10], 'Importación de productos');
    }

    /** @return list<string> ids de la página en orden */
    private function ids(array $json): array
    {
        return array_column($json['data']['data'], 'id');
    }

    private function feed(User $as, array $params = []): \Illuminate\Testing\TestResponse
    {
        return $this->actingAs($as)->getJson('/api/v1/activity?'.http_build_query($params));
    }

    // ─── Permisos ────────────────────────────────────────────────────────────

    public function test_solo_admin_puede_consultar_actividad(): void
    {
        foreach (['/api/v1/activity', '/api/v1/activity/summary', '/api/v1/activity/export'] as $url) {
            $this->actingAs($this->gerente)->getJson($url)->assertStatus(403);
            $this->actingAs($this->cajero)->getJson($url)->assertStatus(403);
        }
        $this->feed($this->admin)->assertOk()->assertJsonPath('success', true);
    }

    public function test_get_logs_ahora_exige_admin(): void
    {
        $this->actingAs($this->gerente)->getJson('/api/v1/logs')->assertStatus(403);
        $this->actingAs($this->admin)->getJson('/api/v1/logs')->assertOk();
    }

    // ─── Orden, paginación y mezcla ──────────────────────────────────────────

    public function test_feed_mezcla_ambas_fuentes_orden_desc_y_pagina_en_servidor(): void
    {
        $res = $this->feed($this->admin, ['per_page' => 3])->assertOk();
        $json = $res->json();

        $this->assertSame(8, $json['data']['pagination']['total']);
        $this->assertSame(3, $json['data']['pagination']['last_page']);
        $ids = $this->ids($json);
        $this->assertCount(3, $ids);
        $this->assertStringStartsWith('log:', $ids[0]); // sale.cancelled 23:00
        $this->assertStringStartsWith('mov:', $ids[1]); // venta 21:00
        $this->assertStringStartsWith('log:', $ids[2]); // product.updated 20:30
        $this->assertSame('sale.cancelled', $json['data']['data'][0]['action']);
        $this->assertSame('mov.venta', $json['data']['data'][1]['action']);

        $page3 = $this->feed($this->admin, ['per_page' => 3, 'page' => 3])->assertOk()->json();
        $this->assertCount(2, $page3['data']['data']);
        $this->assertSame('product.deleted', $page3['data']['data'][0]['action']);
        $this->assertSame('products.import', $page3['data']['data'][1]['action']);
        $this->assertNull($page3['data']['data'][1]['user']);
        $this->assertSame('sistema', $page3['data']['data'][1]['group']);
    }

    public function test_filtro_por_producto_mezcla_fuentes_y_excluye_otros_productos(): void
    {
        $json = $this->feed($this->admin, ['product_ids' => [$this->p1->id]])->assertOk()->json();
        $actions = array_column($json['data']['data'], 'action');
        $this->assertSame(['mov.venta', 'product.updated', 'mov.ajuste', 'mov.entrada'], $actions);
        foreach ($json['data']['data'] as $e) {
            $this->assertSame($this->p1->id, $e['product']['id']);
        }

        // Con ruido entra el log duplicado inventory.adjusted
        $withNoise = $this->feed($this->admin, ['product_ids' => [$this->p1->id], 'include_noise' => 1])->assertOk()->json();
        $this->assertSame(5, $withNoise['data']['pagination']['total']);
        $this->assertContains('inventory.adjusted', array_column($withNoise['data']['data'], 'action'));

        // product_id (singular) también sirve
        $single = $this->feed($this->admin, ['product_id' => $this->p2->id])->assertOk()->json();
        $this->assertSame(['mov.transferencia'], array_column($single['data']['data'], 'action'));
    }

    public function test_ruido_oculto_por_default_y_visible_con_flag(): void
    {
        $default = $this->feed($this->admin)->assertOk()->json();
        $actions = array_column($default['data']['data'], 'action');
        $this->assertNotContains('qz_print_ok', $actions);
        $this->assertNotContains('inventory.adjusted', $actions);
        $this->assertSame(8, $default['data']['pagination']['total']);

        $all = $this->feed($this->admin, ['include_noise' => 1])->assertOk()->json();
        $this->assertSame(11, $all['data']['pagination']['total']);
        $this->assertContains('qz_print_ok', array_column($all['data']['data'], 'action'));

        $summary = $this->actingAs($this->admin)->getJson('/api/v1/activity/summary')->assertOk()->json('data');
        $this->assertSame(['zero_adjustments' => 1, 'print_logs' => 1, 'duplicate_adjust_logs' => 1], $summary['noise_excluded']);
    }

    public function test_producto_borrado_sale_con_nombre_del_snapshot(): void
    {
        $json = $this->feed($this->admin, ['action' => 'product.deleted'])->assertOk()->json();
        $this->assertCount(1, $json['data']['data']);
        $e = $json['data']['data'][0];
        $this->assertSame(9999, $e['product']['id']);
        $this->assertSame('Borrado X', $e['product']['name']);
        $this->assertSame('BX-1', $e['product']['sku']);
        $this->assertTrue($e['product']['deleted']);

        $summary = $this->actingAs($this->admin)->getJson('/api/v1/activity/summary')->assertOk()->json('data');
        $deleted = collect($summary['top_products'])->firstWhere('product.id', 9999);
        $this->assertNotNull($deleted);
        $this->assertSame('Borrado X', $deleted['product']['name']);
        $this->assertTrue($deleted['product']['deleted']);
    }

    public function test_filtro_por_usuario(): void
    {
        $json = $this->feed($this->admin, ['user_id' => $this->cajero->id])->assertOk()->json();
        $this->assertSame(['mov.venta', 'mov.ajuste'], array_column($json['data']['data'], 'action'));

        $withNoise = $this->feed($this->admin, ['user_id' => $this->cajero->id, 'include_noise' => 1])->assertOk()->json();
        $this->assertSame(4, $withNoise['data']['pagination']['total']);

        // El log sin usuario nunca matchea a nadie
        $nobody = $this->feed($this->admin, ['user_id' => 999999])->assertOk()->json();
        $this->assertSame(0, $nobody['data']['pagination']['total']);
    }

    public function test_filtro_por_tienda_solo_movimientos(): void
    {
        $json = $this->feed($this->admin, ['store_id' => $this->storeB->id])->assertOk()->json();
        $this->assertSame(['mov.transferencia'], array_column($json['data']['data'], 'action'));
        $this->assertSame($this->storeB->id, $json['data']['data'][0]['store']['id']);
    }

    // ─── Día de negocio ──────────────────────────────────────────────────────

    public function test_rango_y_fechas_sueltas_usan_dia_de_negocio_tijuana(): void
    {
        // m5 (06:30Z del 28) es 27-oct 23:30 en Tijuana; m4 es 27-oct 08:00.
        $d27 = $this->feed($this->admin, ['from' => '2026-10-27', 'to' => '2026-10-27'])->assertOk()->json();
        $this->assertSame(['mov.entrada', 'mov.transferencia'], array_column($d27['data']['data'], 'action'));

        $d28 = $this->feed($this->admin, ['from' => '2026-10-28', 'to' => '2026-10-28'])->assertOk()->json();
        $this->assertSame(['sale.cancelled', 'mov.venta', 'product.updated', 'mov.ajuste'], array_column($d28['data']['data'], 'action'));

        $dates = $this->feed($this->admin, ['dates' => '2026-10-27,2026-10-25'])->assertOk()->json();
        $this->assertSame(['mov.entrada', 'mov.transferencia', 'products.import'], array_column($dates['data']['data'], 'action'));

        $summary = $this->actingAs($this->admin)->getJson('/api/v1/activity/summary?from=2026-10-25&to=2026-10-29')->assertOk()->json('data');
        $byDay = collect($summary['by_day'])->pluck('count', 'day')->all();
        $this->assertSame(2, $byDay['2026-10-27']);
        $this->assertSame(4, $byDay['2026-10-28']);
        $this->assertSame(1, $byDay['2026-10-26']);
        $this->assertSame(1, $byDay['2026-10-25']);
    }

    // ─── Normalización ───────────────────────────────────────────────────────

    public function test_ajuste_trae_antes_despues_y_delta_con_signo_por_tipo(): void
    {
        $json = $this->feed($this->admin, ['product_ids' => [$this->p1->id]])->assertOk()->json();
        $byAction = collect($json['data']['data'])->keyBy('action');

        $ajuste = $byAction['mov.ajuste'];
        $this->assertEquals(10.0, $ajuste['stock_before']);
        $this->assertEquals(8.0, $ajuste['stock_after']);
        $this->assertEquals(-2.0, $ajuste['qty_delta']);
        $this->assertSame('Exhibición Centro', $ajuste['warehouse']['name']);
        $this->assertSame('Centro', $ajuste['store']['name']);
        $this->assertSame('Cajero', $ajuste['user']['name']);

        $this->assertEquals(-1.0, $byAction['mov.venta']['qty_delta']);
        $this->assertSame('VENTA-5', $byAction['mov.venta']['reference']);
        $this->assertEquals(5.0, $byAction['mov.entrada']['qty_delta']);
        $this->assertNull($byAction['mov.entrada']['stock_before']);

        $edit = $byAction['product.updated'];
        $this->assertSame('Producto editado: nombre, precio Normal', $edit['title']);
        $this->assertSame('producto', $edit['group']);
        $this->assertSame(120, $edit['meta']['changes']['prices.price_1']['new']);
        $this->assertNull($edit['qty_delta']);
    }

    public function test_grupos_por_referencia_y_sistema_para_acciones_desconocidas(): void
    {
        $paquete = $this->feed($this->admin, ['group' => 'paquete'])->assertOk()->json();
        $this->assertSame(['mov.transferencia'], array_column($paquete['data']['data'], 'action'));
        $this->assertSame('paquete', $paquete['data']['data'][0]['group']);

        $sistema = $this->feed($this->admin, ['group' => ['sistema']])->assertOk()->json();
        $this->assertSame(['products.import'], array_column($sistema['data']['data'], 'action'));

        // stock NO incluye el traslado de paquete (PAQ-) ni el ajuste 0→0
        $stock = $this->feed($this->admin, ['group' => 'stock'])->assertOk()->json();
        $this->assertSame(['mov.ajuste', 'mov.entrada'], array_column($stock['data']['data'], 'action'));

        $venta = $this->feed($this->admin, ['group' => 'venta,producto'])->assertOk()->json();
        $this->assertSame(['sale.cancelled', 'mov.venta', 'product.updated', 'product.deleted'], array_column($venta['data']['data'], 'action'));
    }

    public function test_busqueda_por_nombre_sku_o_referencia(): void
    {
        $bySku = $this->feed($this->admin, ['search' => 'ygo-001'])->assertOk()->json();
        $this->assertSame(4, $bySku['data']['pagination']['total']);

        $byRef = $this->feed($this->admin, ['search' => 'VENTA-5'])->assertOk()->json();
        $this->assertSame(['mov.venta'], array_column($byRef['data']['data'], 'action'));

        $byDesc = $this->feed($this->admin, ['search' => 'cancelada'])->assertOk()->json();
        $this->assertSame(['sale.cancelled'], array_column($byDesc['data']['data'], 'action'));
    }

    // ─── Summary ─────────────────────────────────────────────────────────────

    public function test_summary_cuadra_con_el_feed(): void
    {
        $feed = $this->feed($this->admin)->assertOk()->json();
        $summary = $this->actingAs($this->admin)->getJson('/api/v1/activity/summary')->assertOk()->json('data');

        $this->assertSame($feed['data']['pagination']['total'], $summary['totals']['events']);
        $this->assertSame(4, $summary['totals']['movements']);
        $this->assertSame(4, $summary['totals']['logs']);
        $this->assertSame($summary['totals']['events'], array_sum(array_column($summary['by_group'], 'count')));

        $byGroup = collect($summary['by_group'])->pluck('count', 'group')->all();
        $this->assertSame(['stock' => 2, 'venta' => 2, 'producto' => 2, 'paquete' => 1, 'sistema' => 1], array_intersect_key($byGroup, array_flip(['stock', 'venta', 'producto', 'paquete', 'sistema'])));

        $topUser = $summary['by_user'][0];
        $this->assertSame($this->admin->id, $topUser['user']['id']);
        $this->assertSame(5, $topUser['count']);

        $topProduct = $summary['top_products'][0];
        $this->assertSame($this->p1->id, $topProduct['product']['id']);
        $this->assertSame(4, $topProduct['count']);
    }

    // ─── Límites ─────────────────────────────────────────────────────────────

    public function test_rango_amplio_sin_filtro_angosto_es_422(): void
    {
        $this->feed($this->admin, ['from' => '2026-01-01', 'to' => '2026-10-29'])
            ->assertStatus(422)->assertJsonValidationErrors(['from']);

        $this->feed($this->admin, ['from' => '2026-01-01', 'to' => '2026-10-29', 'product_ids' => [$this->p1->id]])->assertOk();
        $this->feed($this->admin, ['from' => '2026-01-01', 'to' => '2026-10-29', 'user_id' => $this->cajero->id])->assertOk();

        $this->feed($this->admin, ['page' => 100, 'per_page' => 200])
            ->assertStatus(422)->assertJsonValidationErrors(['page']);

        $this->feed($this->admin, ['group' => 'nope'])->assertStatus(422);
    }

    // ─── Export ──────────────────────────────────────────────────────────────

    public function test_export_csv_respeta_filtros(): void
    {
        $res = $this->actingAs($this->admin)->get('/api/v1/activity/export?product_ids[]='.$this->p1->id);
        $res->assertOk();
        $this->assertStringStartsWith('text/csv', $res->headers->get('content-type'));

        $csv = $res->streamedContent();
        $lines = array_values(array_filter(explode("\n", trim($csv))));
        $this->assertCount(5, $lines); // cabecera + 4 eventos de P1
        $this->assertStringContainsString('fecha_local,hora_local,usuario', $lines[0]);
        $this->assertStringContainsString('Booster YGO', $lines[1]);
        $this->assertStringContainsString('VENTA-5', $csv);
    }
}
