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
 * Promos GENERALES (2026-07-25): CRUD top-level /promotions + asignación a N
 * productos. La promo es entidad propia — existe sin productos, se asigna
 * 1..N, y las reglas por producto (dup/tipo/tope/pago) corren sobre las
 * ASIGNACIONES vengan de la promo que vengan.
 */
class PromotionGeneralCrudTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $cashier;
    private User $manager;
    private Store $store;
    private Product $productA;
    private Product $productB;

    protected function setUp(): void
    {
        parent::setUp();

        $company = Company::create(['name' => 'Test Co']);
        $this->store = Store::create(['company_id' => $company->id, 'name' => 'Test Store']);

        $this->admin = User::create([
            'name' => 'Admin', 'email' => 'admin@test.com', 'password' => bcrypt('x'),
            'company_id' => $company->id, 'store_id' => $this->store->id,
        ]);
        $this->assignRole($this->admin, 'admin');

        $this->cashier = User::create([
            'name' => 'Cajero', 'email' => 'cajero@test.com', 'password' => bcrypt('x'),
            'company_id' => $company->id, 'store_id' => $this->store->id,
        ]);
        $this->assignRole($this->cashier, 'cajero');

        $this->manager = User::create([
            'name' => 'Gerente', 'email' => 'gerente@test.com', 'password' => bcrypt('x'),
            'company_id' => $company->id, 'store_id' => $this->store->id,
        ]);
        $this->assignRole($this->manager, 'gerente');

        $this->productA = Product::create([
            'company_id' => $company->id, 'name' => 'Manga A', 'sku' => 'MGA-1', 'active' => true,
        ]);
        $this->productB = Product::create([
            'company_id' => $company->id, 'name' => 'Manga B', 'sku' => 'MGB-1', 'active' => true,
        ]);
    }

    private function assignRole(User $user, string $role): void
    {
        $roleId = DB::table('roles')->where('name', $role)->value('id')
            ?? DB::table('roles')->insertGetId(['name' => $role, 'created_at' => now(), 'updated_at' => now()]);
        DB::table('model_has_roles')->insert([
            'role_id' => $roleId, 'model_type' => User::class, 'model_id' => $user->id,
        ]);
    }

    public function test_promo_general_sin_productos_es_legal(): void
    {
        $res = $this->actingAs($this->admin)
            ->postJson('/api/v1/promotions', ['name' => '2x1 General', 'buy_n' => 2, 'pay_m' => 1])
            ->assertStatus(201)
            ->assertJsonPath('data.name', '2x1 General')
            ->assertJsonPath('data.products_count', 0);

        $this->assertNull(
            ProductPromotion::find($res->json('data.id'))->product_id,
            'Una promo general nace SIN product_id legacy.',
        );
    }

    public function test_attach_a_dos_productos_y_ambos_la_embeben(): void
    {
        $promoId = $this->actingAs($this->admin)
            ->postJson('/api/v1/promotions', ['name' => '2x1 Cruzado', 'buy_n' => 2, 'pay_m' => 1])
            ->json('data.id');

        $this->actingAs($this->admin)
            ->postJson("/api/v1/promotions/{$promoId}/products", [
                'product_ids' => [$this->productA->id, $this->productB->id],
            ])
            ->assertStatus(200)
            ->assertJsonPath('data.products_count', 2);

        // El embed active_promotions llega a AMBOS productos con el MISMO id.
        foreach ([$this->productA, $this->productB] as $product) {
            $this->actingAs($this->admin)
                ->getJson("/api/v1/products/{$product->id}")
                ->assertJsonPath('data.active_promotions.0.id', $promoId)
                ->assertJsonPath('data.active_promotions.0.name', '2x1 Cruzado');
        }
    }

    public function test_attach_batch_es_todo_o_nada(): void
    {
        // B ya está al tope: 2 promos activas asignadas en el ámbito global.
        foreach ([1, 2] as $i) {
            ProductPromotion::create([
                'product_id' => $this->productB->id, 'name' => "Mayoreo {$i}",
                'type' => 'qty_discount', 'min_qty' => 3 + $i, 'discount_per_unit' => 10,
            ]);
        }

        $promoId = $this->actingAs($this->admin)
            ->postJson('/api/v1/promotions', ['name' => '2x1 Nuevo', 'buy_n' => 2, 'pay_m' => 1])
            ->json('data.id');

        $this->actingAs($this->admin)
            ->postJson("/api/v1/promotions/{$promoId}/products", [
                'product_ids' => [$this->productA->id, $this->productB->id],
            ])
            ->assertStatus(422);

        // TODO-o-nada: A tampoco quedó asignado aunque él sí pasaba.
        $this->assertSame(0, ProductPromotion::find($promoId)->products()->count());
    }

    public function test_tope_por_producto_cuenta_promos_de_origenes_distintos(): void
    {
        // Dos promos generales distintas asignadas a A (una NxM + un mayoreo
        // — la exclusividad es entre ventanas encimadas del MISMO producto,
        // así que usamos ventanas idénticas de tipos distintos... eso choca.
        // Para llegar al tope sin chocar: 2 NxM con matemática distinta).
        foreach ([['2x1', 2, 1], ['3x2', 3, 2]] as [$name, $n, $m]) {
            $id = $this->actingAs($this->admin)
                ->postJson('/api/v1/promotions', ['name' => $name, 'buy_n' => $n, 'pay_m' => $m])
                ->json('data.id');
            $this->actingAs($this->admin)
                ->postJson("/api/v1/promotions/{$id}/products", ['product_ids' => [$this->productA->id]])
                ->assertStatus(200);
        }

        // La tercera revienta el tope de 2 activas por producto/ámbito.
        $thirdId = $this->actingAs($this->admin)
            ->postJson('/api/v1/promotions', ['name' => '4x3', 'buy_n' => 4, 'pay_m' => 3])
            ->json('data.id');

        $this->actingAs($this->admin)
            ->postJson("/api/v1/promotions/{$thirdId}/products", ['product_ids' => [$this->productA->id]])
            ->assertStatus(422);
    }

    public function test_duplicado_cross_promo_misma_matematica_encimada(): void
    {
        $firstId = $this->actingAs($this->admin)
            ->postJson('/api/v1/promotions', ['name' => '2x1 Uno', 'buy_n' => 2, 'pay_m' => 1])
            ->json('data.id');
        $this->actingAs($this->admin)
            ->postJson("/api/v1/promotions/{$firstId}/products", ['product_ids' => [$this->productA->id]])
            ->assertStatus(200);

        // Otra promo general con el MISMO 2x1 sin fechas (ventana infinita).
        $secondId = $this->actingAs($this->admin)
            ->postJson('/api/v1/promotions', ['name' => '2x1 Dos', 'buy_n' => 2, 'pay_m' => 1])
            ->json('data.id');

        $this->actingAs($this->admin)
            ->postJson("/api/v1/promotions/{$secondId}/products", ['product_ids' => [$this->productA->id]])
            ->assertStatus(422);
    }

    public function test_reactivar_revalida_contra_todos_los_asignados(): void
    {
        // Promo pausada asignada a A y B.
        $pausedId = $this->actingAs($this->admin)
            ->postJson('/api/v1/promotions', ['name' => '2x1 Pausado', 'buy_n' => 2, 'pay_m' => 1, 'status' => 'paused'])
            ->json('data.id');
        $this->actingAs($this->admin)
            ->postJson("/api/v1/promotions/{$pausedId}/products", [
                'product_ids' => [$this->productA->id, $this->productB->id],
            ])->assertStatus(200);

        // SOLO B gana un 2x1 activo idéntico mientras tanto.
        $otherId = $this->actingAs($this->admin)
            ->postJson('/api/v1/promotions', ['name' => '2x1 De B', 'buy_n' => 2, 'pay_m' => 1])
            ->json('data.id');
        $this->actingAs($this->admin)
            ->postJson("/api/v1/promotions/{$otherId}/products", ['product_ids' => [$this->productB->id]])
            ->assertStatus(200);

        // Reactivar la pausada choca por B (aunque A esté limpio) y el
        // mensaje nombra al producto culpable. El PUT reenvía la promo
        // completa — mismo contrato que toggleStatus del frontend.
        $res = $this->actingAs($this->admin)
            ->putJson("/api/v1/promotions/{$pausedId}", [
                'name' => '2x1 Pausado', 'buy_n' => 2, 'pay_m' => 1, 'status' => 'active',
            ])
            ->assertStatus(422);

        $this->assertStringContainsString('Manga B', (string) $res->json('error'));
    }

    public function test_detach_anula_el_puntero_legacy(): void
    {
        // Promo shim-creada: nace con product_id legacy + asignación (hook).
        $promo = ProductPromotion::create([
            'product_id' => $this->productA->id, 'name' => '2x1 Legacy', 'buy_n' => 2, 'pay_m' => 1,
        ]);
        // Multi-asignada para que el detach NO la borre.
        $promo->products()->syncWithoutDetaching([$this->productB->id]);

        $this->actingAs($this->admin)
            ->deleteJson("/api/v1/promotions/{$promo->id}/products/{$this->productA->id}")
            ->assertStatus(200)
            ->assertJsonPath('data.products_count', 1);

        // Sin el null-out, una revisión vieja (que lee product_id directo)
        // seguiría aplicando la promo al producto ya des-asignado.
        $this->assertNull($promo->fresh()->product_id);
    }

    public function test_gerente_no_muta_promo_global_pero_si_la_suya(): void
    {
        $globalId = $this->actingAs($this->admin)
            ->postJson('/api/v1/promotions', ['name' => 'Global', 'buy_n' => 2, 'pay_m' => 1])
            ->json('data.id');

        $this->actingAs($this->manager)
            ->putJson("/api/v1/promotions/{$globalId}", [
                'name' => 'Global', 'buy_n' => 2, 'pay_m' => 1, 'status' => 'paused',
            ])
            ->assertStatus(403);
        $this->actingAs($this->manager)
            ->postJson("/api/v1/promotions/{$globalId}/products", ['product_ids' => [$this->productA->id]])
            ->assertStatus(403);

        // El gerente crea la suya: queda FORZADA a su tienda aunque no mande
        // store_id, y esa sí puede mutarla.
        $localId = $this->actingAs($this->manager)
            ->postJson('/api/v1/promotions', ['name' => 'Local Gerente', 'buy_n' => 3, 'pay_m' => 2])
            ->assertStatus(201)
            ->json('data.id');

        $this->assertSame($this->store->id, ProductPromotion::find($localId)->store_id);

        $this->actingAs($this->manager)
            ->postJson("/api/v1/promotions/{$localId}/products", ['product_ids' => [$this->productA->id]])
            ->assertStatus(200);
        $this->actingAs($this->manager)
            ->putJson("/api/v1/promotions/{$localId}", [
                'name' => 'Local Gerente', 'buy_n' => 3, 'pay_m' => 2, 'status' => 'paused',
            ])
            ->assertStatus(200);
    }

    public function test_cajero_no_crea_pero_si_lista(): void
    {
        $this->actingAs($this->cashier)
            ->postJson('/api/v1/promotions', ['name' => 'Hack', 'buy_n' => 2, 'pay_m' => 1])
            ->assertStatus(403);

        $this->actingAs($this->cashier)
            ->getJson('/api/v1/promotions')
            ->assertStatus(200);
    }

    public function test_borrar_promo_general_limpia_asignaciones_y_no_tickets(): void
    {
        $promo = ProductPromotion::create([
            'product_id' => $this->productA->id, 'name' => '2x1 Borrable', 'buy_n' => 2, 'pay_m' => 1,
        ]);
        $promo->products()->syncWithoutDetaching([$this->productB->id]);

        $this->actingAs($this->admin)
            ->deleteJson("/api/v1/promotions/{$promo->id}")
            ->assertStatus(200);

        $this->assertDatabaseMissing('product_promotions', ['id' => $promo->id]);
        $this->assertDatabaseMissing('product_promotion_assignments', ['promotion_id' => $promo->id]);
    }
}
