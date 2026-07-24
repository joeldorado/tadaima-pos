<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Product;
use App\Models\ProductPromotion;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Promos generales (2026-07-25) — la maquinaria de compatibilidad:
 *  - backfill: cada promo legacy (product_id) → 1 asignación, idempotente
 *  - hook created(): crear con product_id asigna solo (puente en vivo)
 *  - force-delete de producto: una promo multi-asignada SOBREVIVE
 *  - shim DELETE anidado: des-asigna; solo borra si queda sin productos
 */
class PromotionAssignmentBackfillTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private Product $productA;
    private Product $productB;

    protected function setUp(): void
    {
        parent::setUp();

        $company = Company::create(['name' => 'Test Co']);
        $store = Store::create(['company_id' => $company->id, 'name' => 'Test Store']);

        $this->admin = User::create([
            'name' => 'Admin', 'email' => 'admin@test.com', 'password' => bcrypt('x'),
            'company_id' => $company->id, 'store_id' => $store->id,
        ]);
        $roleId = DB::table('roles')->where('name', 'admin')->value('id')
            ?? DB::table('roles')->insertGetId(['name' => 'admin', 'created_at' => now(), 'updated_at' => now()]);
        DB::table('model_has_roles')->insert([
            'role_id' => $roleId, 'model_type' => User::class, 'model_id' => $this->admin->id,
        ]);

        $this->productA = Product::create([
            'company_id' => $company->id, 'name' => 'Manga A', 'sku' => 'MGA-1', 'active' => true,
        ]);
        $this->productB = Product::create([
            'company_id' => $company->id, 'name' => 'Manga B', 'sku' => 'MGB-1', 'active' => true,
        ]);
    }

    public function test_backfill_crea_una_asignacion_por_promo_legacy_y_es_idempotente(): void
    {
        // Insert CRUDO (sin Eloquent) = sin hook, como las filas pre-migración.
        $promoId = DB::table('product_promotions')->insertGetId([
            'product_id' => $this->productA->id, 'name' => '2x1 Legacy',
            'type' => 'nxm', 'buy_n' => 2, 'pay_m' => 1, 'status' => 'active',
            'priority' => 0, 'created_at' => now(), 'updated_at' => now(),
        ]);
        $this->assertDatabaseMissing('product_promotion_assignments', ['promotion_id' => $promoId]);

        (require database_path('migrations/2026_07_25_000003_backfill_promotion_assignments.php'))->up();
        // Idempotencia: correrla dos veces no duplica ni truena.
        (require database_path('migrations/2026_07_25_000003_backfill_promotion_assignments.php'))->up();

        $this->assertSame(1, DB::table('product_promotion_assignments')
            ->where('promotion_id', $promoId)
            ->where('product_id', $this->productA->id)
            ->count());
    }

    public function test_hook_created_asigna_solo_cuando_llega_product_id_legacy(): void
    {
        // El puente en vivo del shim/fixtures: crear vía Eloquent CON product_id.
        $promo = ProductPromotion::create([
            'product_id' => $this->productA->id, 'name' => '2x1 Hook', 'buy_n' => 2, 'pay_m' => 1,
        ]);

        $this->assertDatabaseHas('product_promotion_assignments', [
            'promotion_id' => $promo->id, 'product_id' => $this->productA->id,
        ]);
        // Y una general (sin product_id) NO genera asignación fantasma.
        $general = ProductPromotion::create(['name' => 'General', 'buy_n' => 3, 'pay_m' => 2]);
        $this->assertSame(0, $general->products()->count());
    }

    public function test_force_delete_de_producto_no_mata_promo_multi_asignada(): void
    {
        $promo = ProductPromotion::create([
            'product_id' => $this->productA->id, 'name' => '2x1 Compartido', 'buy_n' => 2, 'pay_m' => 1,
        ]);
        $promo->products()->syncWithoutDetaching([$this->productB->id]);

        $this->actingAs($this->admin)
            ->deleteJson("/api/v1/products/{$this->productA->id}/force")
            ->assertStatus(200);

        // La promo sobrevive: pierde SU asignación (pivote cascade) y el
        // puntero legacy se anuló antes de borrar (sin eso, el FK cascade
        // del product_id la habría matado para B también).
        $fresh = $promo->fresh();
        $this->assertNotNull($fresh, 'El force-delete del producto NO debe borrar la promo compartida.');
        $this->assertNull($fresh->product_id);
        $this->assertSame([$this->productB->id], $fresh->products()->pluck('products.id')->map(fn ($i) => (int) $i)->all());
    }

    public function test_shim_delete_desasigna_y_solo_borra_la_ultima(): void
    {
        $promo = ProductPromotion::create([
            'product_id' => $this->productA->id, 'name' => '2x1 Shim', 'buy_n' => 2, 'pay_m' => 1,
        ]);
        $promo->products()->syncWithoutDetaching([$this->productB->id]);

        // DELETE anidado desde A: des-asigna, la promo sigue viva para B.
        $this->actingAs($this->admin)
            ->deleteJson("/api/v1/products/{$this->productA->id}/promotions/{$promo->id}")
            ->assertStatus(200);
        $this->assertNotNull($promo->fresh());
        $this->assertNull($promo->fresh()->product_id, 'El puntero legacy debe anularse al des-asignar.');

        // DELETE anidado desde B (la última): ahora sí desaparece — la
        // semántica del bundle viejo ("borré la promo del producto") se cumple.
        $this->actingAs($this->admin)
            ->deleteJson("/api/v1/products/{$this->productB->id}/promotions/{$promo->id}")
            ->assertStatus(200);
        $this->assertDatabaseMissing('product_promotions', ['id' => $promo->id]);
    }

    public function test_embed_por_producto_llega_via_pivote_no_via_product_id(): void
    {
        // Promo general asignada SOLO por pivote (product_id legacy = null):
        // el embed active_promotions debe traerla igual — prueba de que ningún
        // lector quedó colgado del campo legacy.
        $promo = ProductPromotion::create(['name' => 'Solo Pivote', 'buy_n' => 2, 'pay_m' => 1]);
        $promo->products()->syncWithoutDetaching([$this->productA->id]);

        $this->actingAs($this->admin)
            ->getJson("/api/v1/products/{$this->productA->id}")
            ->assertJsonPath('data.active_promotions.0.id', $promo->id)
            ->assertJsonPath('data.active_promotions.0.name', 'Solo Pivote');
    }
}
