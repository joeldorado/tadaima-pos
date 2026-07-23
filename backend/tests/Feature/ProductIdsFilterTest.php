<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Bug 2026-07-19 (Joel): la Caja mostraba una promo YA BORRADA porque el
 * carrito guarda un snapshot congelado del producto y solo podía compararlo
 * contra el pool ?sort=top (200 filas). Un producto de poca venta caía fuera
 * de ese pool y su snapshot nunca se refrescaba.
 *
 * ?ids= es la pieza que cierra ese hueco: la Caja pide exactamente los
 * productos que tiene en el carrito.
 */
class ProductIdsFilterTest extends TestCase
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

    /** @return int[] ids de los productos creados, en orden */
    private function seedProducts(User $admin, int $count): array
    {
        $ids = [];
        for ($i = 1; $i <= $count; $i++) {
            $ids[] = (int) $this->actingAs($admin)
                ->postJson('/api/v1/products', [
                    'name' => "Producto {$i}",
                    'sku' => "SKU-{$i}",
                    'price_1' => 100 * $i,
                ])
                ->assertCreated()
                ->json('data.id');
        }

        return $ids;
    }

    private function rows($response): \Illuminate\Support\Collection
    {
        return collect($response->json('data.data') ?? $response->json('data'));
    }

    public function test_ids_filter_returns_only_the_requested_products(): void
    {
        $admin = $this->admin();
        [$first, , $third] = $this->seedProducts($admin, 3);

        $rows = $this->rows(
            $this->actingAs($admin)
                ->getJson("/api/v1/products?light=1&ids={$first},{$third}")
                ->assertOk()
        );

        $this->assertCount(2, $rows);
        $this->assertEqualsCanonicalizing([$first, $third], $rows->pluck('id')->all());
    }

    public function test_without_ids_filter_all_products_come_back(): void
    {
        $admin = $this->admin();
        $this->seedProducts($admin, 3);

        $rows = $this->rows(
            $this->actingAs($admin)->getJson('/api/v1/products?light=1')->assertOk()
        );

        $this->assertCount(3, $rows);
    }

    public function test_garbage_ids_do_not_break_the_endpoint(): void
    {
        $admin = $this->admin();
        [$first] = $this->seedProducts($admin, 2);

        // Basura intercalada: vacíos, texto y un id inexistente. intval los
        // colapsa a 0 y array_filter los tira, así que solo sobrevive $first.
        $rows = $this->rows(
            $this->actingAs($admin)
                ->getJson("/api/v1/products?light=1&ids={$first},,abc,0,999999")
                ->assertOk()
        );

        $this->assertCount(1, $rows);
        $this->assertSame($first, $rows->first()['id']);
    }

    public function test_ids_filter_composes_with_active_filter(): void
    {
        $admin = $this->admin();
        [$first, $second] = $this->seedProducts($admin, 2);

        $this->actingAs($admin)
            ->putJson("/api/v1/products/{$second}", ['active' => false])
            ->assertOk();

        $rows = $this->rows(
            $this->actingAs($admin)
                ->getJson("/api/v1/products?light=1&active=1&ids={$first},{$second}")
                ->assertOk()
        );

        $this->assertCount(1, $rows, 'El producto inactivo no debe volver con ?active=1');
        $this->assertSame($first, $rows->first()['id']);
    }
}
