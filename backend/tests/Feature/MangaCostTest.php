<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Product;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Librería (mangas/tomos): el COSTO REAL no se captura directo, se deriva del
 * precio público y el margen → `cost = public_price × (1 − margin/100)`.
 *
 * Bug QA 2026-06-04 (Ruben/hermano): al registrar/editar un tomo el costo
 * quedaba en NULL porque el frontend manda `public_price`+`profit_margin_percent`
 * pero el controller guardaba `cost = data['cost'] ?? null` (nunca llega `cost`).
 * Estos tests fijan que el backend derive y persista el costo (lo lee caja,
 * reportes de utilidad y el snapshot ADR-015).
 */
class MangaCostTest extends TestCase
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

        // Editar mangas ahora requiere rol admin/gerente (gate 2026-06-10).
        $roleId = \DB::table('roles')->insertGetId([
            'name' => 'admin', 'guard_name' => 'api',
            'created_at' => now(), 'updated_at' => now(),
        ]);
        \DB::table('model_has_roles')->insert([
            'role_id' => $roleId, 'model_type' => User::class, 'model_id' => $user->id,
        ]);

        return $user;
    }

    public function test_store_derives_cost_from_public_price_and_margin(): void
    {
        $this->actingAs($this->admin())
            ->postJson('/api/v1/mangas', [
                'name' => 'Naruto',
                'volume_number' => 1,
                'public_price' => 100,
                'profit_margin_percent' => 30,
            ])
            ->assertCreated();

        // costo = 100 × (1 − 30/100) = 70
        $this->assertEqualsWithDelta(70.0, (float) Product::where('name', 'Naruto')->value('cost'), 0.001);
    }

    public function test_update_recomputes_cost_when_price_or_margin_changes(): void
    {
        $admin = $this->admin();

        $created = $this->actingAs($admin)
            ->postJson('/api/v1/mangas', [
                'name' => 'Bleach',
                'public_price' => 100,
                'profit_margin_percent' => 30,
            ])
            ->assertCreated()
            ->json('data.id');

        $this->actingAs($admin)
            ->putJson("/api/v1/mangas/{$created}", [
                'public_price' => 200,
                'profit_margin_percent' => 50,
            ])
            ->assertOk();

        // costo = 200 × (1 − 50/100) = 100
        $this->assertEqualsWithDelta(100.0, (float) Product::find($created)->cost, 0.001);
    }
}
