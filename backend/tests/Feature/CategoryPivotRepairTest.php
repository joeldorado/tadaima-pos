<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Product;
use App\Models\ProductCategory;
use App\Support\CategoryPivotRepair;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * CategoryPivotRepair (2026-08-18): el servicio viejo (tadaima.poslite.com.mx,
 * código previo a categorías múltiples) escribe SOLO products.category_id.
 * La reparación inserta ese category_id en el pivote cuando el producto no
 * tiene ninguno; nunca toca productos con pivote (el pivote manda).
 */
class CategoryPivotRepairTest extends TestCase
{
    use RefreshDatabase;

    private Company $company;
    private ProductCategory $cartas;
    private ProductCategory $funko;

    protected function setUp(): void
    {
        parent::setUp();
        $this->company = Company::create(['name' => 'Tadaima Test']);
        $this->cartas = ProductCategory::create(['name' => 'Cartas', 'active' => true]);
        $this->funko = ProductCategory::create(['name' => 'FUNKO', 'active' => true]);
    }

    /** Simula el servicio viejo: category_id directo, sin pivote. */
    private function legacyProduct(string $name, ?int $categoryId): Product
    {
        $p = Product::create([
            'company_id' => $this->company->id, 'name' => $name,
            'sku' => 'SKU-'.uniqid(), 'active' => true,
        ]);
        DB::table('products')->where('id', $p->id)->update(['category_id' => $categoryId]);

        return $p->fresh();
    }

    public function test_repara_solo_los_que_tienen_category_id_y_no_pivote(): void
    {
        $viejo = $this->legacyProduct('Booster MTG Marvel', $this->cartas->id);
        $sinNada = $this->legacyProduct('Sin categoría real', null);
        $nuevo = $this->legacyProduct('Con pivote', $this->cartas->id);
        $nuevo->syncCategories([$this->funko->id, $this->cartas->id]);
        // Inconsistencia inversa: pivote [funko, cartas] pero caché apuntando a
        // otra cosa — el pivote manda, no se toca.
        DB::table('products')->where('id', $nuevo->id)->update(['category_id' => $this->cartas->id]);

        $this->assertSame(1, CategoryPivotRepair::pendingCount());
        $this->assertSame(1, CategoryPivotRepair::run());
        $this->assertSame(0, CategoryPivotRepair::pendingCount());

        $this->assertSame([$this->cartas->id], $viejo->fresh()->categories->pluck('id')->all());
        $this->assertSame([], $sinNada->fresh()->categories->pluck('id')->all());
        $this->assertSame(
            [$this->funko->id, $this->cartas->id],
            $nuevo->fresh()->categories->pluck('id')->all(),
        );
    }

    public function test_es_idempotente(): void
    {
        $this->legacyProduct('Pop León', $this->funko->id);

        $this->assertSame(1, CategoryPivotRepair::run());
        $this->assertSame(0, CategoryPivotRepair::run());
        $this->assertSame(1, DB::table('product_category_assignments')->count());
    }

    public function test_el_producto_reparado_deja_de_ser_sin_categoria_en_el_api(): void
    {
        $viejo = $this->legacyProduct('Booster MTG Marvel', $this->cartas->id);
        $admin = \App\Models\User::create([
            'name' => 'admin', 'email' => 'admin@test.com', 'password' => bcrypt('x'),
            'company_id' => $this->company->id, 'active' => true,
        ]);
        $roleId = DB::table('roles')->where('name', 'admin')->value('id')
            ?? DB::table('roles')->insertGetId(['name' => 'admin', 'guard_name' => 'api', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('model_has_roles')->insert(['role_id' => $roleId, 'model_type' => \App\Models\User::class, 'model_id' => $admin->id]);

        $antes = $this->actingAs($admin)->getJson('/api/v1/products?no_category=1&per_page=0')->assertOk()->json('data');
        $this->assertContains($viejo->id, collect($antes)->pluck('id')->all());

        CategoryPivotRepair::run();

        $despues = $this->actingAs($admin)->getJson('/api/v1/products?no_category=1&per_page=0')->assertOk()->json('data');
        $this->assertNotContains($viejo->id, collect($despues)->pluck('id')->all());
    }

    public function test_comando_dry_run_no_escribe_y_real_repara(): void
    {
        $this->legacyProduct('Booster MTG Marvel', $this->cartas->id);

        $this->artisan('tadaima:reparar-categorias', ['--dry-run' => true, '--connection' => 'sqlite', '--unsafe-host' => true])
            ->assertSuccessful();
        $this->assertSame(0, DB::table('product_category_assignments')->count());

        $this->artisan('tadaima:reparar-categorias', ['--connection' => 'sqlite', '--unsafe-host' => true])
            ->assertSuccessful();
        $this->assertSame(1, DB::table('product_category_assignments')->count());
    }
}
