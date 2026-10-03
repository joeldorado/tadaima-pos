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

    // ── Bug 2026-10-03: editar un tomo dejaba costo = precio público ─────────
    // Un usuario sin permiso de ver costos no recibe el margen, el modal mandaba
    // `profit_margin_percent: 0` y el costo quedaba igual al precio (utilidad $0).
    // En edición, margen vacío/0 = "conservar el margen que ya tiene el tomo".

    private function gerenteSinCostos(): User
    {
        $company = Company::firstOrCreate(['name' => 'Tadaima Test']);

        $user = User::create([
            'name' => 'Caja Principal',
            'email' => 'gerente@test.com',
            'password' => bcrypt('password'),
            'company_id' => $company->id,
            'active' => true,
            'can_view_cost' => false,
        ]);

        $roleId = \DB::table('roles')->insertGetId([
            'name' => 'gerente', 'guard_name' => 'api',
            'created_at' => now(), 'updated_at' => now(),
        ]);
        \DB::table('model_has_roles')->insert([
            'role_id' => $roleId, 'model_type' => User::class, 'model_id' => $user->id,
        ]);

        return $user;
    }

    private function tomo(float $precioA, ?float $costo, string $name = 'Tomo 19 MHA'): Product
    {
        $tomo = Product::create([
            'name' => $name,
            'sku' => 'T-'.uniqid(),
            'cost' => $costo,
            'active' => true,
            'product_type' => Product::TYPE_MANGA,
        ]);
        $tomo->price()->create(['price_1' => $precioA]);

        return $tomo;
    }

    public function test_update_con_margen_cero_no_pisa_el_costo(): void
    {
        $tomo = $this->tomo(159, 111.30);

        // Payload real del modal para un usuario sin permiso de costos.
        $this->actingAs($this->gerenteSinCostos())
            ->putJson("/api/v1/mangas/{$tomo->id}", [
                'name' => 'Tomo 19 My Hero Academia',
                'public_price' => 159,
                'price_1' => 159,
                'profit_margin_percent' => 0,
            ])
            ->assertOk();

        $this->assertEqualsWithDelta(111.30, (float) $tomo->fresh()->cost, 0.001);

        $log = \DB::table('system_logs')->where('action', 'manga.updated')->where('entity_id', $tomo->id)->first();
        $this->assertNotNull($log, 'el cambio de nombre sí se registra');
        $this->assertArrayNotHasKey('cost', json_decode((string) $log->meta, true)['changes']);
    }

    public function test_update_sin_margen_no_toca_el_costo(): void
    {
        $tomo = $this->tomo(159, 111.30);

        $this->actingAs($this->gerenteSinCostos())
            ->putJson("/api/v1/mangas/{$tomo->id}", ['name' => 'Tomo 19 My Hero Academia'])
            ->assertOk();

        $this->assertEqualsWithDelta(111.30, (float) $tomo->fresh()->cost, 0.001);
    }

    public function test_update_cambio_de_precio_sin_margen_conserva_el_margen(): void
    {
        $tomo = $this->tomo(159, 111.30);

        $this->actingAs($this->gerenteSinCostos())
            ->putJson("/api/v1/mangas/{$tomo->id}", [
                'public_price' => 179,
                'price_1' => 179,
                'profit_margin_percent' => 0,
            ])
            ->assertOk();

        // mismo margen (30%) sobre el precio nuevo: 179 × 0.70 = 125.30
        $this->assertEqualsWithDelta(125.30, (float) $tomo->fresh()->cost, 0.001);
    }

    public function test_update_con_margen_valido_calcula_sobre_el_precio_a(): void
    {
        $tomo = $this->tomo(159, 111.30);

        // "Precio Público" no se guarda; la base del costo es el precio A.
        $this->actingAs($this->admin())
            ->putJson("/api/v1/mangas/{$tomo->id}", [
                'public_price' => 200,
                'price_1' => 180,
                'profit_margin_percent' => 30,
            ])
            ->assertOk();

        $this->assertEqualsWithDelta(126.00, (float) $tomo->fresh()->cost, 0.001);
    }

    public function test_update_solo_con_public_price_no_saca_el_costo_de_la_regla(): void
    {
        $tomo = $this->tomo(159, 111.30);

        // Otro cliente (app móvil) manda public_price sin price_1: el precio A
        // guardado sigue en 159, así que el costo no se mueve.
        $this->actingAs($this->admin())
            ->putJson("/api/v1/mangas/{$tomo->id}", [
                'public_price' => 200,
                'profit_margin_percent' => 30,
            ])
            ->assertOk();

        $tomo->refresh();
        $this->assertEqualsWithDelta(159.0, (float) $tomo->price->price_1, 0.001);
        $this->assertEqualsWithDelta(111.30, (float) $tomo->cost, 0.001);
    }

    public function test_update_que_vacia_el_precio_a_no_inventa_costo(): void
    {
        $tomo = $this->tomo(159, 111.30);

        // El modal con "Precio Normal" vacío manda price_1: null.
        $this->actingAs($this->admin())
            ->putJson("/api/v1/mangas/{$tomo->id}", [
                'public_price' => 200,
                'price_1' => null,
                'profit_margin_percent' => 30,
            ])
            ->assertOk();

        $this->assertEqualsWithDelta(111.30, (float) $tomo->fresh()->cost, 0.001);
    }

    public function test_update_tomo_sin_costo_sigue_sin_costo_si_no_llega_margen_valido(): void
    {
        $tomo = $this->tomo(159, null);
        $admin = $this->admin();

        foreach ([0, 100] as $margen) {
            $this->actingAs($admin)
                ->putJson("/api/v1/mangas/{$tomo->id}", [
                    'public_price' => 159,
                    'price_1' => 159,
                    'profit_margin_percent' => $margen,
                ])
                ->assertOk();

            $this->assertNull($tomo->fresh()->cost, "margen {$margen} no inventa un costo");
        }
    }

    public function test_update_guardar_sin_cambios_no_mueve_centavos(): void
    {
        // 333.33 sobre 999 = 66.63% al mostrarlo; recalcular con 66.63 daría 333.36.
        $tomo = $this->tomo(999, 333.33);

        $this->actingAs($this->admin())
            ->putJson("/api/v1/mangas/{$tomo->id}", [
                'public_price' => 999,
                'price_1' => 999,
                'profit_margin_percent' => 66.63,
            ])
            ->assertOk();

        $this->assertEqualsWithDelta(333.33, (float) $tomo->fresh()->cost, 0.001);
    }
}
