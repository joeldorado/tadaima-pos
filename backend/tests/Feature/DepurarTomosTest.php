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
 * tadaima:depurar-tomos (Ruben/Joel 2026-08-17): en el módulo Tomos solo
 * queda lo que empieza con "Tomo"; lo demás de las categorías librería con
 * stock pasa a producto normal, sin stock se borra (con historial se
 * desactiva). Comics "Tomo…" se quedan como Comics.
 */
class DepurarTomosTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;

    private Store $store;

    private Warehouse $warehouse;

    private User $admin;

    private ProductCategory $catManga;

    private ProductCategory $catExtranjero;

    private ProductCategory $catKamite;

    private ProductCategory $catComics;

    private ProductCategory $catLibretas;

    private ProductCategory $catFiguras;

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
            'name' => 'Admin', 'email' => 'depurar@test.com', 'password' => bcrypt('x'),
            'company_id' => $this->company->id,
        ]);
        $this->catManga = ProductCategory::create(['name' => 'Manga', 'active' => true]);
        $this->catExtranjero = ProductCategory::create(['name' => 'Manga extranjero', 'active' => true]);
        $this->catKamite = ProductCategory::create(['name' => 'kamite', 'active' => true]);
        $this->catComics = ProductCategory::create(['name' => 'Comics', 'active' => true]);
        $this->catLibretas = ProductCategory::create(['name' => 'Libretas', 'active' => true]);
        $this->catFiguras = ProductCategory::create(['name' => 'Figuras', 'active' => true]);
    }

    private function make(string $name, ProductCategory $cat, string $type, float $stock = 0): Product
    {
        $p = Product::create([
            'name' => $name, 'sku' => 'SKU-'.uniqid(), 'active' => true,
            'product_type' => $type, 'category_id' => $cat->id,
        ]);
        if ($type === Product::TYPE_MANGA) {
            DB::table('product_manga_details')->insert([
                'product_id' => $p->id, 'created_at' => now(), 'updated_at' => now(),
            ]);
        }
        if ($stock > 0) {
            DB::table('inventory')->insert([
                'product_id' => $p->id, 'warehouse_id' => $this->warehouse->id,
                'quantity' => $stock, 'created_at' => now(), 'updated_at' => now(),
            ]);
        }

        return $p;
    }

    private function runDepurar(array $extra = [])
    {
        return $this->artisan('tadaima:depurar-tomos', array_merge([
            '--connection' => config('database.default'),
            '--unsafe-host' => true,
            '--user' => (string) $this->admin->id,
            '--force' => true,
        ], $extra));
    }

    public function test_solo_tomos_quedan_en_manga_resto_a_producto_o_borrado(): void
    {
        $tomo = $this->make('Tomo 1 Naruto', $this->catManga, Product::TYPE_MANGA);           // se queda manga
        $tomoMinus = $this->make('  tomo 5 One Piece', $this->catManga, Product::TYPE_MANGA);   // trim + case → se queda
        $conStock = $this->make('Manga zoro jap', $this->catExtranjero, Product::TYPE_MANGA, 2); // → producto
        $sinStock = $this->make('Art book Zelda', $this->catExtranjero, Product::TYPE_MANGA);     // → borrar
        $kamiteSin = $this->make('camite toradora 1', $this->catKamite, Product::TYPE_MANGA);     // → borrar
        $comicTomo = $this->make('Tomo Eternos', $this->catComics, Product::TYPE_PRODUCT);        // Comics se queda Comics
        $comicSin = $this->make('Spider-Man #3', $this->catComics, Product::TYPE_PRODUCT);        // sin stock → borrar
        $libretaSin = $this->make('Mandala naruto', $this->catLibretas, Product::TYPE_PRODUCT);   // sin stock → borrar
        $libretaCon = $this->make('Libreta Totoro', $this->catLibretas, Product::TYPE_PRODUCT, 1); // con stock → se queda
        $figura = $this->make('Figura Goku', $this->catFiguras, Product::TYPE_PRODUCT);           // fuera del universo

        $this->runDepurar()->assertExitCode(0);

        $this->assertSame('manga', $tomo->fresh()->product_type);
        $this->assertSame('manga', $tomoMinus->fresh()->product_type);

        $conStock->refresh();
        $this->assertSame('product', $conStock->product_type, 'no-tomo con stock → producto normal');
        $this->assertSame($this->catExtranjero->id, $conStock->category_id, 'conserva su categoría');
        $this->assertTrue((bool) $conStock->active);

        $this->assertNull(Product::find($sinStock->id), 'no-tomo sin stock → borrado');
        $this->assertNull(Product::find($kamiteSin->id));
        $this->assertNull(Product::find($comicSin->id), 'comic sin stock → borrado (ya no es librería)');
        $this->assertNull(Product::find($libretaSin->id));

        $comicTomo->refresh();
        $this->assertSame('product', $comicTomo->product_type, 'Comics "Tomo…" se queda Comics');
        $this->assertSame($this->catComics->id, $comicTomo->category_id);

        $this->assertNotNull(Product::find($libretaCon->id));
        $this->assertNotNull(Product::find($figura->id), 'fuera del universo librería: intacto');

        // Invariante final: ningún manga que no empiece con Tomo
        $this->assertSame(0, Product::where('product_type', 'manga')
            ->whereRaw("LOWER(TRIM(name)) NOT LIKE 'tomo%'")->count());
    }

    public function test_con_historial_se_desactiva_y_pasa_a_producto_en_vez_de_borrar(): void
    {
        $conVentas = $this->make('Manga Panini', $this->catManga, Product::TYPE_MANGA);
        $sale = Sale::create([
            'store_id' => $this->store->id, 'user_id' => $this->admin->id,
            'subtotal' => 100, 'discount' => 0, 'total' => 100, 'status' => Sale::STATUS_COMPLETED,
        ]);
        SaleItem::create([
            'sale_id' => $sale->id, 'product_id' => $conVentas->id,
            'quantity' => 1, 'price' => 100, 'total' => 100,
        ]);

        $this->runDepurar()->assertExitCode(0);

        $conVentas->refresh();
        $this->assertFalse((bool) $conVentas->active);
        $this->assertSame('product', $conVentas->product_type);
    }

    public function test_nulifica_promo_ancla_antes_de_borrar(): void
    {
        $sinStock = $this->make('Box set Naruto', $this->catManga, Product::TYPE_MANGA);
        $promoId = DB::table('product_promotions')->insertGetId([
            'product_id' => $sinStock->id, 'name' => 'Promo', 'buy_n' => 3, 'pay_m' => 2,
            'status' => 'active', 'created_at' => now(), 'updated_at' => now(),
        ]);

        $this->runDepurar()->assertExitCode(0);

        $this->assertNull(Product::find($sinStock->id));
        $this->assertDatabaseHas('product_promotions', ['id' => $promoId, 'product_id' => null]);
    }

    public function test_dry_run_no_escribe_nada(): void
    {
        $sinStock = $this->make('Art book Zelda', $this->catExtranjero, Product::TYPE_MANGA);
        $conStock = $this->make('Manga zoro jap', $this->catExtranjero, Product::TYPE_MANGA, 2);

        $this->runDepurar(['--dry-run' => true])->assertExitCode(0);

        $this->assertNotNull(Product::find($sinStock->id));
        $this->assertSame('manga', $conStock->fresh()->product_type);
    }

    public function test_es_idempotente(): void
    {
        $this->make('Tomo 1 Naruto', $this->catManga, Product::TYPE_MANGA);
        $this->make('Manga zoro jap', $this->catExtranjero, Product::TYPE_MANGA, 2);
        $this->make('Art book Zelda', $this->catExtranjero, Product::TYPE_MANGA);

        $this->runDepurar()->assertExitCode(0);
        $total = Product::count();
        $this->runDepurar()->assertExitCode(0);

        $this->assertSame($total, Product::count());
    }
}
