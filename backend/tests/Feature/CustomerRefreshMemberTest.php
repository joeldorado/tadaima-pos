<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Customer;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * POST /customers/{customer}/refresh-member — refresca el snapshot del socio
 * Tadaima desde Supabase (solo lectura). Supabase se simula con Http::fake;
 * el endpoint nunca debe escribir a Supabase, solo a la tabla local customers.
 */
class CustomerRefreshMemberTest extends TestCase
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
            'email'      => 'qa-refresh@test.com',
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

        // Config de Supabase para forzar la rama HTTP (no el stub local).
        config([
            'services.tadaima_loyalty.url'         => 'https://stub.supabase.co',
            'services.tadaima_loyalty.service_key' => 'service-key',
        ]);
    }

    public function test_non_socio_customer_cannot_refresh(): void
    {
        $customer = Customer::create(['name' => 'Cliente local']);

        $this->actingAs($this->user, 'sanctum')
            ->postJson("/api/v1/customers/{$customer->id}/refresh-member")
            ->assertStatus(422);
    }

    public function test_refresh_updates_snapshot_from_supabase(): void
    {
        Http::fake([
            '*/rest/v1/socios*' => Http::response([[
                'id_socio'                    => 'TAD10000001',
                'activo'                      => false,
                'nivel_membresia'             => 'b',
                'fecha_vencimiento_membresia' => '2025-01-01',
                'usuarios'                    => [
                    'nombre'    => 'Mario',
                    'apellidos' => 'Mitre',
                    'email'     => 'mario@tadaima.com',
                    'telefono'  => '5551234567',
                ],
            ]], 200),
        ]);

        $customer = Customer::create([
            'name'               => 'Mario Mitre',
            'external_member_id' => 'TAD10000001',
            'member_status'      => 'ACTIVO', // estaba activo, Supabase ahora lo da de baja
        ]);

        $res = $this->actingAs($this->user, 'sanctum')
            ->postJson("/api/v1/customers/{$customer->id}/refresh-member");

        $res->assertSuccessful();
        $res->assertJsonPath('data.member_status', 'INACTIVO');
        $res->assertJsonPath('data.member_level', 'b');

        $customer->refresh();
        $this->assertSame('INACTIVO', $customer->member_status);
        $this->assertNotNull($customer->member_synced_at);
    }

    public function test_refresh_404_keeps_local_snapshot(): void
    {
        // Supabase responde vacío (socio ya no existe) → 404 y NO se pisa el snapshot.
        Http::fake(['*/rest/v1/socios*' => Http::response([], 200)]);

        $customer = Customer::create([
            'name'               => 'Socio fantasma',
            'external_member_id' => 'TAD99999999',
            'member_status'      => 'ACTIVO',
        ]);

        $this->actingAs($this->user, 'sanctum')
            ->postJson("/api/v1/customers/{$customer->id}/refresh-member")
            ->assertStatus(404);

        $customer->refresh();
        $this->assertSame('ACTIVO', $customer->member_status); // snapshot intacto
    }
}
