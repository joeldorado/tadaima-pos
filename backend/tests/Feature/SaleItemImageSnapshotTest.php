<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\CashRegister;
use App\Models\CashRegisterSession;
use App\Models\Company;
use App\Models\Inventory;
use App\Models\PaymentMethod;
use App\Models\Product;
use App\Models\ProductImage;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\Store;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Imagen congelada en la línea de venta (2026-10-10).
 *
 * `sale_items.product_image` guarda el `image_path` del producto al cobrar,
 * igual que `product_name`/`product_sku`: si después el producto cambia de
 * foto o se borra, la venta conserva la que se vendió. Las líneas anteriores
 * a la migración (sin snapshot) siguen mostrando la imagen actual del catálogo.
 */
class SaleItemImageSnapshotTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;
    private Store $store;
    private Warehouse $warehouse;
    private User $admin;
    private CashRegisterSession $session;
    private PaymentMethod $cashMethod;

    protected function setUp(): void
    {
        parent::setUp();

        $this->company = Company::create(['name' => 'Test Co']);
        $this->store = Store::create(['company_id' => $this->company->id, 'name' => 'Test Store']);
        $this->warehouse = Warehouse::create([
            'company_id' => $this->company->id, 'store_id' => $this->store->id,
            'name' => 'Exhibición', 'type' => 'store', 'active' => true,
        ]);
        $this->admin = User::create([
            'name' => 'Admin', 'email' => 'admin@test.com', 'password' => bcrypt('x'),
            'company_id' => $this->company->id, 'store_id' => $this->store->id, 'active' => true,
        ]);
        $roleId = DB::table('roles')->where('name', 'admin')->value('id')
            ?? DB::table('roles')->insertGetId([
                'name' => 'admin', 'guard_name' => 'api',
                'created_at' => now(), 'updated_at' => now(),
            ]);
        DB::table('model_has_roles')->insert([
            'role_id' => $roleId, 'model_type' => User::class, 'model_id' => $this->admin->id,
        ]);

        $register = CashRegister::create(['store_id' => $this->store->id, 'name' => 'Caja 1', 'active' => true]);
        $this->session = CashRegisterSession::create([
            'register_id' => $register->id, 'user_id' => $this->admin->id,
            'opening_cash' => 0, 'status' => 'open', 'opened_at' => now(),
        ]);
        $this->cashMethod = PaymentMethod::firstOrCreate(['name' => 'Efectivo'], ['active' => true]);
    }

    /** @param list<string> $imagePaths En orden de `sort_order`. */
    private function makeProduct(array $imagePaths, string $name = 'Figura Goku'): Product
    {
        $product = Product::create([
            'company_id' => $this->company->id,
            'name' => $name, 'sku' => 'SKU-' . uniqid(),
            'cost' => 40, 'active' => true,
        ]);
        $product->price()->create(['price_1' => 100]);
        Inventory::create(['product_id' => $product->id, 'warehouse_id' => $this->warehouse->id, 'quantity' => 10]);
        foreach ($imagePaths as $order => $path) {
            ProductImage::create(['product_id' => $product->id, 'image_path' => $path, 'sort_order' => $order]);
        }

        return $product;
    }

    /** Venta real vía checkout (POST /sales) de 1 unidad. */
    private function sellOne(Product $product): Sale
    {
        $this->actingAs($this->admin)->postJson('/api/v1/sales', [
            'store_id' => $this->store->id,
            'register_session_id' => $this->session->id,
            'items' => [['product_id' => $product->id, 'quantity' => 1, 'price' => 100]],
            'payments' => [['payment_method_id' => $this->cashMethod->id, 'amount' => 100]],
        ])->assertStatus(201);

        return Sale::latest('id')->firstOrFail();
    }

    /** @return array<string, mixed> Primera línea de la venta según `GET /sales/{id}`. */
    private function saleItemFromApi(Sale $sale): array
    {
        return $this->actingAs($this->admin)
            ->getJson("/api/v1/sales/{$sale->id}")
            ->assertOk()->json('data.items.0');
    }

    public function test_checkout_congela_la_primera_imagen_valida(): void
    {
        // La primera fila trae un path corrupto ('0'): se salta, no se congela.
        $product = $this->makeProduct(['0', 'products/goku/primera.jpg', 'products/goku/segunda.jpg']);

        $sale = $this->sellOne($product);

        $item = SaleItem::where('sale_id', $sale->id)->firstOrFail();
        $this->assertSame('products/goku/primera.jpg', $item->product_image);
        $this->assertSame(100.0, (float) $sale->total);
    }

    public function test_la_venta_conserva_su_imagen_aunque_el_producto_cambie_de_foto(): void
    {
        $product = $this->makeProduct(['products/goku/primera.jpg']);
        $sale = $this->sellOne($product);

        ProductImage::where('product_id', $product->id)->delete();
        ProductImage::create(['product_id' => $product->id, 'image_path' => 'products/goku/nueva.jpg', 'sort_order' => 0]);

        $item = $this->saleItemFromApi($sale);
        $this->assertStringEndsWith('products/goku/primera.jpg', $item['product_image']);
        // `product.image` repite el mismo valor para quien ya lo consumía.
        $this->assertSame($item['product_image'], $item['product']['image']);

        // El listado trae lo mismo que el detalle.
        $row = collect($this->actingAs($this->admin)->getJson('/api/v1/sales')->assertOk()->json('data.data'))
            ->firstWhere('id', $sale->id);
        $this->assertSame($item['product_image'], $row['items'][0]['product_image']);
    }

    public function test_la_venta_conserva_su_imagen_aunque_se_borre_el_producto(): void
    {
        $product = $this->makeProduct(['products/goku/primera.jpg']);
        $sale = $this->sellOne($product);

        $this->actingAs($this->admin)->deleteJson("/api/v1/products/{$product->id}")->assertOk();

        $item = $this->saleItemFromApi($sale);
        $this->assertTrue($item['product_deleted']);
        $this->assertStringEndsWith('products/goku/primera.jpg', $item['product_image']);
    }

    public function test_una_linea_sin_snapshot_muestra_la_imagen_actual_del_catalogo(): void
    {
        // Venta anterior a la migración: la línea no tiene imagen congelada.
        $product = $this->makeProduct(['products/goku/primera.jpg']);
        $sale = $this->sellOne($product);
        DB::table('sale_items')->where('sale_id', $sale->id)->update(['product_image' => null]);

        ProductImage::where('product_id', $product->id)->delete();
        ProductImage::create(['product_id' => $product->id, 'image_path' => 'products/goku/nueva.jpg', 'sort_order' => 0]);

        $this->assertStringEndsWith('products/goku/nueva.jpg', $this->saleItemFromApi($sale)['product_image']);
    }

    public function test_un_producto_sin_imagen_se_cobra_normal_y_devuelve_null(): void
    {
        $product = $this->makeProduct([]);

        $sale = $this->sellOne($product);

        $this->assertNull(SaleItem::where('sale_id', $sale->id)->firstOrFail()->product_image);
        $item = $this->saleItemFromApi($sale);
        $this->assertNull($item['product_image']);
        $this->assertNull($item['product']['image']);
    }
}
