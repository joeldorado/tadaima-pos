<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Product;
use App\Models\ProductCategory;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Categorías: el índice expone products_count (para que el admin vea qué
 * categoría tiene productos antes de intentar borrarla) y el DELETE de una
 * categoría con productos los DESVINCULA (Joel 2026-08-17; antes bloqueaba
 * con 422 y el equipo solo veía un error genérico).
 */
class ProductCategoryTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;

    protected function setUp(): void
    {
        parent::setUp();

        $company = Company::create(['name' => 'Test Co']);
        $this->admin = User::create([
            'name' => 'Admin', 'email' => 'cat@test.com', 'password' => bcrypt('x'),
            'company_id' => $company->id, 'active' => true,
        ]);
        $roleId = DB::table('roles')->where('name', 'admin')->value('id')
            ?? DB::table('roles')->insertGetId([
                'name' => 'admin', 'guard_name' => 'api', 'created_at' => now(), 'updated_at' => now(),
            ]);
        DB::table('model_has_roles')->insert([
            'role_id' => $roleId, 'model_type' => User::class, 'model_id' => $this->admin->id,
        ]);
    }

    public function test_index_expone_products_count_por_categoria(): void
    {
        $conProductos = ProductCategory::create(['name' => 'amiibos', 'active' => true]);
        $vacia = ProductCategory::create(['name' => 'Hair clips', 'active' => true]);
        foreach (range(1, 3) as $i) {
            Product::create(['name' => "Amiibo {$i}", 'sku' => "AM-{$i}", 'active' => true])
                ->syncCategories([$conProductos->id]);
        }

        $rows = collect($this->actingAs($this->admin)->getJson('/api/v1/categories')->assertOk()->json('data'));

        $this->assertSame(3, $rows->firstWhere('id', $conProductos->id)['products_count']);
        $this->assertSame(0, $rows->firstWhere('id', $vacia->id)['products_count']);
    }

    public function test_borra_categoria_con_productos_desvinculandolos(): void
    {
        // Desde 2026-08-17 (Joel): se puede borrar aunque tenga productos —
        // se desvinculan y quedan "Sin categoría" si no tenían otra.
        $cat = ProductCategory::create(['name' => 'Hairclips', 'active' => true]);
        $a = Product::create(['name' => 'Clip A', 'sku' => 'HC-1', 'active' => true]);
        $a->syncCategories([$cat->id]);
        $b = Product::create(['name' => 'Clip B', 'sku' => 'HC-2', 'active' => true]);
        $b->syncCategories([$cat->id]);

        $resp = $this->actingAs($this->admin)->deleteJson("/api/v1/categories/{$cat->id}")->assertOk();

        $this->assertSame(2, $resp->json('data.unlinked'));
        $this->assertSame(2, $resp->json('data.left_without_category'));
        $this->assertStringContainsString('2 productos desvinculados', $resp->json('message'));
        $this->assertDatabaseMissing('product_categories', ['id' => $cat->id]);
        $this->assertNull($a->fresh()->category_id);
        $this->assertDatabaseHas('products', ['id' => $a->id]);
        $this->assertDatabaseHas('products', ['id' => $b->id]);
    }

    public function test_borra_categoria_sin_productos(): void
    {
        $cat = ProductCategory::create(['name' => 'Hair clips', 'active' => true]);

        $this->actingAs($this->admin)->deleteJson("/api/v1/categories/{$cat->id}")->assertOk();

        $this->assertDatabaseMissing('product_categories', ['id' => $cat->id]);
    }
}
