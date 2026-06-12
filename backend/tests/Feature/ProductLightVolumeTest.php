<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * QA 2026-06-11 (Joel): dos tomos de la misma serie se veían idénticos en el
 * catálogo de Caja ("Naruto t1" × 2) porque el payload light no traía el
 * número de tomo. Estos tests fijan que GET /products?light=1 exponga
 * `volume_number` para mangas (y null para productos normales).
 */
class ProductLightVolumeTest extends TestCase
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

    public function test_light_payload_includes_volume_number_for_mangas(): void
    {
        $admin = $this->admin();

        $this->actingAs($admin)
            ->postJson('/api/v1/mangas', [
                'name' => 'Naruto',
                'volume_number' => 7,
                'public_price' => 100,
                'profit_margin_percent' => 30,
            ])
            ->assertCreated();

        $response = $this->actingAs($admin)
            ->getJson('/api/v1/products?light=1')
            ->assertOk();

        $row = collect($response->json('data.data') ?? $response->json('data'))
            ->firstWhere('name', 'Naruto');

        $this->assertNotNull($row, 'El manga no apareció en el listado light');
        $this->assertSame('manga', $row['product_type']);
        $this->assertSame(7, $row['volume_number']);
    }

    public function test_light_payload_volume_number_is_null_for_regular_products(): void
    {
        $admin = $this->admin();

        $this->actingAs($admin)
            ->postJson('/api/v1/products', [
                'name' => 'Escarabajo metal',
                'sku' => 'ESC-001',
                'price_1' => 1000,
            ])
            ->assertCreated();

        $response = $this->actingAs($admin)
            ->getJson('/api/v1/products?light=1')
            ->assertOk();

        $row = collect($response->json('data.data') ?? $response->json('data'))
            ->firstWhere('name', 'Escarabajo metal');

        $this->assertNotNull($row, 'El producto no apareció en el listado light');
        $this->assertNull($row['volume_number']);
    }
}
