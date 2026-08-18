<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Product;
use App\Models\ProductCategory;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Categorías múltiples (Joel 2026-08-17): N categorías por producto, todas
 * iguales (sin principal), vía pivote product_category_assignments.
 * `products.category_id` queda solo como caché de compat (= la primera).
 */
class ProductMultiCategoryTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;

    private Store $store;

    private User $admin;

    private ProductCategory $figuras;

    private ProductCategory $funkos;

    private ProductCategory $manga;

    protected function setUp(): void
    {
        parent::setUp();

        $this->company = Company::create(['name' => 'Test Co']);
        $this->store = Store::create(['company_id' => $this->company->id, 'name' => 'Tienda', 'active' => true]);
        $this->admin = User::create([
            'name' => 'Admin', 'email' => 'multicat@test.com', 'password' => bcrypt('x'),
            'company_id' => $this->company->id, 'active' => true,
        ]);
        $roleId = DB::table('roles')->where('name', 'admin')->value('id')
            ?? DB::table('roles')->insertGetId([
                'name' => 'admin', 'guard_name' => 'api', 'created_at' => now(), 'updated_at' => now(),
            ]);
        DB::table('model_has_roles')->insert([
            'role_id' => $roleId, 'model_type' => User::class, 'model_id' => $this->admin->id,
        ]);
        $this->figuras = ProductCategory::create(['name' => 'Figuras', 'active' => true]);
        $this->funkos = ProductCategory::create(['name' => 'Funko', 'active' => true]);
        $this->manga = ProductCategory::create(['name' => 'Manga', 'active' => true]);
    }

    // ── Modelo ────────────────────────────────────────────────────────────────

    public function test_sync_categories_escribe_pivote_y_cache(): void
    {
        $p = Product::create(['name' => 'Pop Goku', 'sku' => 'POP-1', 'active' => true]);

        $p->syncCategories([$this->funkos->id, $this->figuras->id, $this->funkos->id]);

        $this->assertSame([$this->funkos->id, $this->figuras->id], $p->categories()->pluck('product_categories.id')->all());
        $this->assertSame($this->funkos->id, $p->fresh()->category_id, 'la caché es la primera');

        $p->syncCategories([$this->figuras->id]);
        $this->assertSame([$this->figuras->id], $p->categories()->pluck('product_categories.id')->all());
        $this->assertSame($this->figuras->id, $p->fresh()->category_id);

        $p->syncCategories([]);
        $this->assertSame(0, $p->categories()->count());
        $this->assertNull($p->fresh()->category_id, 'sin categorías → caché NULL');
    }

    // ── API productos ─────────────────────────────────────────────────────────

    public function test_store_con_category_ids_y_resource_expone_categories(): void
    {
        $resp = $this->actingAs($this->admin)->postJson('/api/v1/products', [
            'name' => 'Pop Luffy', 'sku' => 'POP-2', 'price_1' => 350,
            'category_ids' => [$this->funkos->id, $this->figuras->id],
        ])->assertCreated();

        $cats = collect($resp->json('data.categories'))->pluck('name')->all();
        $this->assertSame(['Funko', 'Figuras'], $cats);
        $this->assertSame($this->funkos->id, $resp->json('data.category_id'), 'category_id compat = primera');

        $p = Product::where('sku', 'POP-2')->first();
        $this->assertSame(2, $p->categories()->count());
    }

    public function test_store_compat_con_category_id_solo(): void
    {
        $resp = $this->actingAs($this->admin)->postJson('/api/v1/products', [
            'name' => 'Fig Nezuko', 'sku' => 'FIG-1', 'price_1' => 250,
            'category_id' => $this->figuras->id,
        ])->assertCreated();

        $this->assertSame([$this->figuras->id], collect($resp->json('data.categories'))->pluck('id')->all());
    }

    public function test_update_reemplaza_categorias(): void
    {
        $p = Product::create(['name' => 'Taza', 'sku' => 'TZ-1', 'active' => true]);
        $p->syncCategories([$this->figuras->id]);

        $this->actingAs($this->admin)->putJson("/api/v1/products/{$p->id}", [
            'category_ids' => [$this->funkos->id, $this->manga->id],
        ])->assertOk();

        $this->assertSame([$this->funkos->id, $this->manga->id], $p->categories()->pluck('product_categories.id')->all());
        $this->assertSame($this->funkos->id, $p->fresh()->category_id);

        // update sin tocar categorías las conserva
        $this->actingAs($this->admin)->putJson("/api/v1/products/{$p->id}", ['name' => 'Taza 2'])->assertOk();
        $this->assertSame(2, $p->categories()->count());
    }

    public function test_filtro_category_id_matchea_cualquiera_de_sus_categorias(): void
    {
        $doble = Product::create(['name' => 'Pop Goku', 'sku' => 'POP-3', 'active' => true]);
        $doble->syncCategories([$this->funkos->id, $this->figuras->id]);
        $soloFig = Product::create(['name' => 'Fig Vegeta', 'sku' => 'FIG-2', 'active' => true]);
        $soloFig->syncCategories([$this->figuras->id]);

        $ids = collect($this->actingAs($this->admin)
            ->getJson("/api/v1/products?category_id={$this->funkos->id}")->assertOk()->json('data'))
            ->pluck('id')->all();
        $this->assertSame([$doble->id], $ids);

        $ids = collect($this->actingAs($this->admin)
            ->getJson("/api/v1/products?category_id={$this->figuras->id}")->assertOk()->json('data'))
            ->pluck('id')->sort()->values()->all();
        $this->assertSame(collect([$doble->id, $soloFig->id])->sort()->values()->all(), $ids);
    }

    public function test_light_expone_category_ids(): void
    {
        $p = Product::create(['name' => 'Pop Goku', 'sku' => 'POP-4', 'active' => true]);
        $p->syncCategories([$this->funkos->id, $this->figuras->id]);

        $row = collect($this->actingAs($this->admin)->getJson('/api/v1/products?light=1')->assertOk()->json('data'))
            ->firstWhere('id', $p->id);
        $this->assertSame([$this->funkos->id, $this->figuras->id], $row['category_ids']);
        $this->assertSame($this->funkos->id, $row['category_id']);
    }

    // ── API tomos ─────────────────────────────────────────────────────────────

    public function test_manga_store_y_update_con_category_ids(): void
    {
        $resp = $this->actingAs($this->admin)->postJson('/api/v1/mangas', [
            'name' => 'Tomo 1 Frieren', 'code' => 'MNG-1', 'public_price' => 169, 'profit_margin_percent' => 40,
            'category_ids' => [$this->manga->id],
        ])->assertCreated();
        $id = (int) $resp->json('data.id');
        $this->assertSame([$this->manga->id], Product::find($id)->categories()->pluck('product_categories.id')->all());

        $this->actingAs($this->admin)->putJson("/api/v1/mangas/{$id}", [
            'category_ids' => [$this->manga->id, $this->figuras->id],
        ])->assertOk();
        $this->assertSame(2, Product::find($id)->categories()->count());
    }

    // ── Categorías: conteo, productos vinculados y borrado con desvinculación ─

    public function test_categories_index_cuenta_vinculos_del_pivote(): void
    {
        $doble = Product::create(['name' => 'Pop Goku', 'sku' => 'POP-5', 'active' => true]);
        $doble->syncCategories([$this->funkos->id, $this->figuras->id]);

        $rows = collect($this->actingAs($this->admin)->getJson('/api/v1/categories')->assertOk()->json('data'));
        $this->assertSame(1, $rows->firstWhere('id', $this->funkos->id)['products_count']);
        $this->assertSame(1, $rows->firstWhere('id', $this->figuras->id)['products_count']);
        $this->assertSame(0, $rows->firstWhere('id', $this->manga->id)['products_count']);
    }

    public function test_categories_products_lista_vinculados_y_si_quedaran_sin_categoria(): void
    {
        $doble = Product::create(['name' => 'Pop Goku', 'sku' => 'POP-6', 'active' => true]);
        $doble->syncCategories([$this->funkos->id, $this->figuras->id]);
        $solo = Product::create(['name' => 'Pop Solo', 'sku' => 'POP-7', 'active' => true]);
        $solo->syncCategories([$this->funkos->id]);

        $data = $this->actingAs($this->admin)->getJson("/api/v1/categories/{$this->funkos->id}/products")
            ->assertOk()->json('data');

        $this->assertSame(2, $data['total']);
        $rows = collect($data['products'])->keyBy('id');
        $this->assertSame('POP-6', $rows[$doble->id]['sku']);
        $this->assertSame(1, $rows[$doble->id]['other_categories_count']);
        $this->assertSame(0, $rows[$solo->id]['other_categories_count'], 'este quedará sin categoría');
    }

    public function test_destroy_desvincula_productos_y_actualiza_cache(): void
    {
        $doble = Product::create(['name' => 'Pop Goku', 'sku' => 'POP-8', 'active' => true]);
        $doble->syncCategories([$this->funkos->id, $this->figuras->id]);   // caché = funkos
        $solo = Product::create(['name' => 'Pop Solo', 'sku' => 'POP-9', 'active' => true]);
        $solo->syncCategories([$this->funkos->id]);

        $resp = $this->actingAs($this->admin)->deleteJson("/api/v1/categories/{$this->funkos->id}")->assertOk();

        $this->assertSame(2, $resp->json('data.unlinked'));
        $this->assertSame(1, $resp->json('data.left_without_category'));
        $this->assertDatabaseMissing('product_categories', ['id' => $this->funkos->id]);

        $this->assertSame([$this->figuras->id], $doble->fresh()->categories()->pluck('product_categories.id')->all());
        $this->assertSame($this->figuras->id, $doble->fresh()->category_id, 'la caché pasa a la que le queda');
        $this->assertSame(0, $solo->fresh()->categories()->count());
        $this->assertNull($solo->fresh()->category_id);
        // Los productos siguen existiendo
        $this->assertDatabaseHas('products', ['id' => $doble->id]);
        $this->assertDatabaseHas('products', ['id' => $solo->id]);
    }
}
