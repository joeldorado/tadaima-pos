<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Product;
use App\Models\ProductCategory;
use App\Models\Sale;
use App\Models\SaleCancellation;
use App\Models\SaleItem;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Reportes por categoría (2026-10-03): el listado de ventas manda las
 * categorías de cada producto vendido (las mismas que en Productos) para que
 * Reportes y el Excel del corte agrupen por categoría A-Z.
 */
class SaleItemCategoriesTest extends TestCase
{
    use RefreshDatabase;

    public function test_listado_de_ventas_trae_las_categorias_del_producto_en_orden(): void
    {
        $company = Company::create(['name' => 'Tadaima Test']);
        $store = Store::create(['company_id' => $company->id, 'name' => 'Tienda A', 'active' => true]);
        $user = $this->makeCajero($company, $store);

        $shonen = ProductCategory::create(['name' => 'Shonen', 'active' => true]);
        $manga = ProductCategory::create(['name' => 'Manga', 'active' => true]);
        $conCategorias = Product::create(['company_id' => $company->id, 'name' => 'Tomo 1', 'sku' => 'T-1', 'active' => true]);
        $conCategorias->syncCategories([$manga->id, $shonen->id]);
        $sinCategoria = Product::create(['company_id' => $company->id, 'name' => 'Llavero', 'sku' => 'L-1', 'active' => true]);

        $sale = Sale::create([
            'store_id' => $store->id, 'user_id' => $user->id,
            'subtotal' => 300, 'discount' => 0, 'total' => 300,
            'status' => Sale::STATUS_COMPLETED,
        ]);
        foreach ([$conCategorias, $sinCategoria] as $product) {
            SaleItem::create([
                'sale_id' => $sale->id, 'product_id' => $product->id,
                'product_name' => $product->name, 'product_sku' => $product->sku,
                'quantity' => 1, 'price' => 150, 'total' => 150,
            ]);
        }

        $range = 'from='.now()->subDay()->toDateString().'&to='.now()->addDay()->toDateString();
        $items = collect($this->actingAs($user)->getJson('/api/v1/sales?'.$range)->assertOk()->json('data.data.0.items'))
            ->keyBy('product_id');

        $this->assertSame(['Manga', 'Shonen'], $items[$conCategorias->id]['product']['categories']);
        $this->assertSame([], $items[$sinCategoria->id]['product']['categories']);
    }

    public function test_venta_cancelada_completa_trae_las_categorias_de_lo_cancelado(): void
    {
        $company = Company::create(['name' => 'Tadaima Test']);
        $store = Store::create(['company_id' => $company->id, 'name' => 'Tienda A', 'active' => true]);
        $user = $this->makeCajero($company, $store);

        $electronica = ProductCategory::create(['name' => 'Electrónica', 'active' => true]);
        $cargador = Product::create(['company_id' => $company->id, 'name' => 'Cargador', 'sku' => 'C-1', 'active' => true]);
        $cargador->syncCategories([$electronica->id]);

        // Cancelada completa (ADR-016): la línea ya no está en sale_items, solo en el snapshot.
        $sale = Sale::create([
            'store_id' => $store->id, 'user_id' => $user->id,
            'subtotal' => 0, 'discount' => 0, 'total' => 0,
            'status' => Sale::STATUS_COMPLETED,
        ]);
        SaleCancellation::create([
            'sale_id' => $sale->id, 'mode' => 'full', 'reason_code' => 'otro',
            'amount_refunded' => 249, 'cancelled_by' => $user->id,
            'items_snapshot' => [[
                'product_id' => $cargador->id, 'name' => 'Cargador', 'sku' => 'C-1',
                'qty_cancelled' => 1, 'price' => 249, 'line_total' => 249,
            ]],
        ]);

        $range = 'from='.now()->subDay()->toDateString().'&to='.now()->addDay()->toDateString();
        $cancelled = $this->actingAs($user)->getJson('/api/v1/sales?'.$range)->assertOk()->json('data.data.0.cancelled_items.0');

        $this->assertSame(['Electrónica'], $cancelled['categories']);
    }

    private function makeCajero(Company $company, Store $store): User
    {
        $user = User::create([
            'name' => 'Cajero', 'email' => 'cajero.cat@test.com', 'password' => bcrypt('password'),
            'company_id' => $company->id, 'store_id' => $store->id, 'active' => true,
        ]);
        $roleId = DB::table('roles')->where('name', 'cajero')->value('id')
            ?? DB::table('roles')->insertGetId([
                'name' => 'cajero', 'guard_name' => 'api',
                'created_at' => now(), 'updated_at' => now(),
            ]);
        DB::table('model_has_roles')->insert([
            'role_id' => $roleId, 'model_type' => User::class, 'model_id' => $user->id,
        ]);

        return $user;
    }
}
