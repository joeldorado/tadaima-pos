<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Product;
use App\Models\ProductCategory;
use App\Models\Sale;
use App\Models\SaleItem;
use App\Models\Store;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * tadaima:purge-no-stock — borra sin-stock conservando librería (mangas,
 * comics, libretas...) y desactivando (no borrando) lo que tiene historial.
 */
class PurgeNoStockProductsTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;
    private Store $store;
    private Warehouse $warehouse;
    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $this->company = Company::create(['name' => 'Test Co']);
        $this->store = Store::create(['company_id' => $this->company->id, 'name' => 'Tienda', 'active' => true]);
        $this->warehouse = Warehouse::create([
            'company_id' => $this->company->id, 'store_id' => $this->store->id,
            'name' => 'Exhibición', 'type' => 'store', 'active' => true,
        ]);
        $this->admin = User::create([
            'name' => 'Admin', 'email' => 'purge@test.com', 'password' => bcrypt('x'),
            'company_id' => $this->company->id,
        ]);
    }

    private function makeProduct(array $attrs = [], float $stock = 0): Product
    {
        $p = Product::create(array_merge([
            'name' => 'Prod '.uniqid(), 'sku' => 'SKU-'.uniqid(), 'active' => true,
            'product_type' => Product::TYPE_PRODUCT,
        ], $attrs));
        if ($stock > 0) {
            DB::table('inventory')->insert([
                'product_id' => $p->id, 'warehouse_id' => $this->warehouse->id,
                'quantity' => $stock, 'created_at' => now(), 'updated_at' => now(),
            ]);
        }

        return $p;
    }

    private function runPurge(array $extra = [], bool $confirm = true, ?string $confirmMsg = null)
    {
        $pending = $this->artisan('tadaima:purge-no-stock', array_merge([
            '--connection' => config('database.default'),
            '--unsafe-host' => true,
            '--user' => (string) $this->admin->id,
        ], $extra));
        if ($confirm && $confirmMsg !== null) {
            $pending->expectsConfirmation($confirmMsg, 'yes');
        }

        return $pending;
    }

    public function test_borra_sin_stock_pero_protege_solo_tomos(): void
    {
        // Desde 2026-08-17 (Ruben/Joel): librería = solo tomos (product_type
        // manga). Comics/libretas sin stock se purgan como cualquier producto.
        $catComics = ProductCategory::create(['name' => 'Comics', 'active' => true]);
        $catLibretas = ProductCategory::create(['name' => 'Libretas', 'active' => true]);
        $catFiguras = ProductCategory::create(['name' => 'Figuras', 'active' => true]);

        $manga = $this->makeProduct(['product_type' => Product::TYPE_MANGA, 'name' => 'Tomo 1 Naruto']); // sin stock, tomo → se queda
        $comic = $this->makeProduct(['category_id' => $catComics->id]);                  // sin stock → BORRAR (ya no protegido)
        $libreta = $this->makeProduct(['category_id' => $catLibretas->id]);              // sin stock → BORRAR (ya no protegido)
        $figuraSin = $this->makeProduct(['category_id' => $catFiguras->id]);             // sin stock → BORRAR
        $figuraCon = $this->makeProduct(['category_id' => $catFiguras->id], stock: 3);   // con stock → se queda
        $sinCategoria = $this->makeProduct();                                            // sin stock, sin categoría → BORRAR

        $this->runPurge(confirmMsg: sprintf('¿Borrar %d y desactivar %d productos en %s?', 4, 0, config('database.default')))
            ->assertExitCode(0);

        $this->assertDatabaseHas('products', ['id' => $manga->id]);
        $this->assertDatabaseHas('products', ['id' => $figuraCon->id]);
        $this->assertDatabaseMissing('products', ['id' => $comic->id]);
        $this->assertDatabaseMissing('products', ['id' => $libreta->id]);
        $this->assertDatabaseMissing('products', ['id' => $figuraSin->id]);
        $this->assertDatabaseMissing('products', ['id' => $sinCategoria->id]);
    }

    public function test_con_ventas_se_desactiva_en_vez_de_borrar(): void
    {
        $vendido = $this->makeProduct(); // sin stock, con venta histórica
        $sale = Sale::create([
            'store_id' => $this->store->id, 'user_id' => $this->admin->id,
            'subtotal' => 100, 'discount' => 0, 'total' => 100, 'status' => Sale::STATUS_COMPLETED,
        ]);
        SaleItem::create([
            'sale_id' => $sale->id, 'product_id' => $vendido->id,
            'quantity' => 1, 'price' => 100, 'total' => 100,
        ]);
        $limpio = $this->makeProduct(); // sin stock, sin historial

        $this->runPurge(confirmMsg: sprintf('¿Borrar %d y desactivar %d productos en %s?', 1, 1, config('database.default')))
            ->assertExitCode(0);

        // El vendido sobrevive desactivado — el histórico conserva su nombre.
        $this->assertDatabaseHas('products', ['id' => $vendido->id, 'active' => false]);
        $this->assertDatabaseMissing('products', ['id' => $limpio->id]);
        $this->assertDatabaseHas('sale_items', ['sale_id' => $sale->id, 'product_id' => $vendido->id]);
    }

    public function test_nulifica_promos_antes_de_borrar(): void
    {
        $conPromo = $this->makeProduct();
        $promoId = DB::table('product_promotions')->insertGetId([
            'product_id' => $conPromo->id, 'name' => 'Promo 2x1', 'buy_n' => 2, 'pay_m' => 1,
            'status' => 'active', 'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->runPurge(confirmMsg: sprintf('¿Borrar %d y desactivar %d productos en %s?', 1, 0, config('database.default')))
            ->assertExitCode(0);

        $this->assertDatabaseMissing('products', ['id' => $conPromo->id]);
        // La promo sobrevive con ancla en NULL (no la mata el CASCADE).
        $this->assertDatabaseHas('product_promotions', ['id' => $promoId, 'product_id' => null]);
    }

    public function test_dry_run_no_escribe_nada(): void
    {
        $borrable = $this->makeProduct();
        $vendible = $this->makeProduct([], stock: 2);

        $this->runPurge(['--dry-run' => true], confirm: false)->assertExitCode(0);

        $this->assertDatabaseHas('products', ['id' => $borrable->id, 'active' => true]);
        $this->assertDatabaseHas('products', ['id' => $vendible->id]);
        $this->assertSame(0, DB::table('system_logs')->where('action', 'products.purged_no_stock')->count());
    }

    public function test_escribe_system_log_con_resumen(): void
    {
        $this->makeProduct();
        $this->makeProduct();

        $this->runPurge(confirmMsg: sprintf('¿Borrar %d y desactivar %d productos en %s?', 2, 0, config('database.default')))
            ->assertExitCode(0);

        $this->assertSame(1, DB::table('system_logs')->where('action', 'products.purged_no_stock')->count());
    }

    public function test_guard_rechaza_host_no_supabase_sin_flag(): void
    {
        $this->makeProduct();

        $this->artisan('tadaima:purge-no-stock', ['--connection' => config('database.default')])
            ->assertExitCode(1);

        $this->assertSame(1, Product::count());
    }
}
