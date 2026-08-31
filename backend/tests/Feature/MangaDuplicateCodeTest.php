<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Product;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Bug QA 2026-08-31 (cliente vía Joel): en Alta de Manga (lote), un `code` que
 * ya existía como SKU de otro producto tronaba con QueryException (UNIQUE en
 * products.sku) → 500 "Server Error" sin explicación en el modal.
 *
 * Fix: StoreMangaRequest/UpdateMangaRequest validan el código ANTES de insertar
 * y regresan 422 nombrando al producto dueño del código. Update ignora el
 * propio tomo (guardar sin cambiar código sigue siendo válido).
 */
class MangaDuplicateCodeTest extends TestCase
{
    use RefreshDatabase;

    private function admin(): User
    {
        $company = Company::create(['name' => 'Tadaima Test']);

        $user = User::create([
            'name' => 'Admin',
            'email' => 'admin@test.com',
            'password' => bcrypt('password'),
            'company_id' => $company->id,
            'active' => true,
            'can_view_cost' => true,
        ]);

        $roleId = \DB::table('roles')->insertGetId([
            'name' => 'admin', 'guard_name' => 'api',
            'created_at' => now(), 'updated_at' => now(),
        ]);
        \DB::table('model_has_roles')->insert([
            'role_id' => $roleId, 'model_type' => User::class, 'model_id' => $user->id,
        ]);

        return $user;
    }

    private function makeManga(string $name, string $sku): Product
    {
        $product = Product::create([
            'name' => $name,
            'sku' => $sku,
            'barcode' => $sku,
            'product_type' => Product::TYPE_MANGA,
            'active' => true,
        ]);
        \DB::table('product_manga_details')->insert([
            'product_id' => $product->id,
            'volume_number' => 1,
            'created_at' => now(), 'updated_at' => now(),
        ]);

        return $product;
    }

    public function test_store_rejects_duplicate_code_with_clear_message(): void
    {
        $this->makeManga('Chainsaw Man Tomo 1', 'ISBN-777');

        $response = $this->actingAs($this->admin())
            ->postJson('/api/v1/mangas', [
                'name' => 'Otro Tomo',
                'volume_number' => 2,
                'code' => 'ISBN-777',
                'public_price' => 189,
                'profit_margin_percent' => 30,
            ]);

        $response->assertStatus(422)
            ->assertJsonValidationErrors(['code']);

        // El mensaje nombra al producto que ya tiene el código — nada de "Server Error".
        $msg = $response->json('errors.code.0');
        $this->assertStringContainsString('ISBN-777', $msg);
        $this->assertStringContainsString('Chainsaw Man Tomo 1', $msg);

        // No se creó nada a medias.
        $this->assertSame(1, Product::where('sku', 'ISBN-777')->count());
        $this->assertDatabaseMissing('products', ['name' => 'Otro Tomo']);
    }

    public function test_store_accepts_unique_code(): void
    {
        $this->makeManga('Chainsaw Man Tomo 1', 'ISBN-777');

        $this->actingAs($this->admin())
            ->postJson('/api/v1/mangas', [
                'name' => 'Otro Tomo',
                'volume_number' => 2,
                'code' => 'ISBN-888',
                'public_price' => 189,
                'profit_margin_percent' => 30,
            ])
            ->assertCreated();

        $this->assertDatabaseHas('products', ['name' => 'Otro Tomo', 'sku' => 'ISBN-888']);
    }

    public function test_update_rejects_code_owned_by_another_product(): void
    {
        $this->makeManga('Chainsaw Man Tomo 1', 'ISBN-777');
        $mine = $this->makeManga('Chainsaw Man Tomo 2', 'ISBN-888');

        $response = $this->actingAs($this->admin())
            ->putJson("/api/v1/mangas/{$mine->id}", ['code' => 'ISBN-777']);

        $response->assertStatus(422)->assertJsonValidationErrors(['code']);
        $this->assertStringContainsString('Chainsaw Man Tomo 1', $response->json('errors.code.0'));

        // El tomo editado conserva su código original.
        $this->assertSame('ISBN-888', $mine->fresh()->sku);
    }

    public function test_update_allows_keeping_own_code(): void
    {
        $mine = $this->makeManga('Chainsaw Man Tomo 2', 'ISBN-888');

        $this->actingAs($this->admin())
            ->putJson("/api/v1/mangas/{$mine->id}", [
                'name' => 'Chainsaw Man Tomo 2 (Reimpresión)',
                'code' => 'ISBN-888',
            ])
            ->assertOk();

        $this->assertSame('Chainsaw Man Tomo 2 (Reimpresión)', $mine->fresh()->name);
    }
}
