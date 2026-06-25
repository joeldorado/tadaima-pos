<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Customer;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Bug 2026-06-24: al asignar un socio Tadaima (external_member_id, importado de
 * Supabase) a una venta, recrearlo reventaba contra el unique de
 * external_member_id / phone → toast "No se pudo asignar al cliente". Ahora
 * CustomerController::store hace upsert por external_member_id y el teléfono
 * nulo no bloquea (el unique plano de Laravel trataba NULL como valor).
 */
class CustomerSocioUpsertTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    protected function setUp(): void
    {
        parent::setUp();

        $company = Company::create(['name' => 'Tadaima QA']);
        $store   = Store::create(['company_id' => $company->id, 'name' => 'Tienda QA']);
        $this->user = User::create([
            'name'       => 'QA Admin',
            'email'      => 'qa-admin@test.com',
            'password'   => bcrypt('password'),
            'company_id' => $company->id,
            'store_id'   => $store->id,
        ]);

        $roleId = DB::table('roles')->insertGetId([
            'name'       => 'admin',
            'guard_name' => 'api',
            'created_at' => now(),
            'updated_at' => now(),
        ]);
        DB::table('model_has_roles')->insert([
            'role_id'    => $roleId,
            'model_type' => User::class,
            'model_id'   => $this->user->id,
        ]);
    }

    public function test_reimporting_same_socio_is_idempotent(): void
    {
        $payload = [
            'name'               => 'Ruben Socio',
            'external_member_id' => 'TAD10000001',
            'loyalty_tier'       => 'Oro',
        ];

        $first = $this->actingAs($this->user, 'sanctum')
            ->postJson('/api/v1/customers', $payload);
        $first->assertCreated();

        // Reasignar el MISMO socio no debe reventar (antes: 422 unique).
        $second = $this->actingAs($this->user, 'sanctum')
            ->postJson('/api/v1/customers', $payload);
        $second->assertSuccessful();

        $this->assertSame($first->json('data.id'), $second->json('data.id'));
        $this->assertSame(1, Customer::where('external_member_id', 'TAD10000001')->count());
    }

    public function test_socio_without_phone_does_not_collide_on_null_phone(): void
    {
        $this->actingAs($this->user, 'sanctum')->postJson('/api/v1/customers', [
            'name'               => 'Socio A',
            'external_member_id' => 'TAD0001',
        ])->assertCreated();

        // Segundo socio sin teléfono: el unique plano de phone bloqueaba aquí.
        $this->actingAs($this->user, 'sanctum')->postJson('/api/v1/customers', [
            'name'               => 'Socio B',
            'external_member_id' => 'TAD0002',
        ])->assertCreated();

        $this->assertSame(2, Customer::whereNull('phone')->count());
    }

    public function test_manual_customer_keeps_phone_uniqueness(): void
    {
        $this->actingAs($this->user, 'sanctum')->postJson('/api/v1/customers', [
            'name'  => 'Cliente Uno',
            'phone' => '6641234567',
        ])->assertCreated();

        // Cliente manual (sin socio) con teléfono repetido sí se rechaza.
        $this->actingAs($this->user, 'sanctum')->postJson('/api/v1/customers', [
            'name'  => 'Cliente Dos',
            'phone' => '6641234567',
        ])->assertStatus(422);
    }

    public function test_socio_member_snapshot_persists_on_import(): void
    {
        $res = $this->actingAs($this->user, 'sanctum')->postJson('/api/v1/customers', [
            'name'               => 'Socio Snapshot',
            'external_member_id' => 'TAD20000001',
            'member_status'      => 'ACTIVO',
            'member_level'       => 'b',
            'member_expires_at'  => '2027-01-01',
        ]);
        $res->assertCreated();

        $c = Customer::where('external_member_id', 'TAD20000001')->first();
        $this->assertSame('ACTIVO', $c->member_status);
        $this->assertSame('b', $c->member_level);
        $this->assertNotNull($c->member_synced_at); // el alta marca la sync
    }

    public function test_membership_level_is_not_a_loyalty_tier(): void
    {
        // El nivel de membresía ("b") NO es un loyalty_tier válido. El frontend lo
        // manda como member_level; si por error llega como loyalty_tier, se rechaza
        // (este era el origen del 422 "Los datos enviados no son válidos").
        $this->actingAs($this->user, 'sanctum')->postJson('/api/v1/customers', [
            'name'         => 'Nivel mal mapeado',
            'loyalty_tier' => 'b',
        ])->assertStatus(422);

        // Pero member_level sí acepta "b".
        $this->actingAs($this->user, 'sanctum')->postJson('/api/v1/customers', [
            'name'               => 'Nivel bien mapeado',
            'external_member_id' => 'TAD30000001',
            'member_level'       => 'b',
        ])->assertCreated();
    }
}
