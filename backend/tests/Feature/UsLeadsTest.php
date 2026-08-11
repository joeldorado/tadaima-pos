<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * TadaimaUS — leads del sitio US:
 *  Público: POST /us/leads — newsletter ("We hear you!" / Sign Up, solo email)
 *           y contact (nombre + email + mensaje). Honeypot `website`.
 *  Admin:   GET /us/leads?source= — bandeja del panel, solo-admin.
 */
class UsLeadsTest extends TestCase
{
    use RefreshDatabase;

    private User $admin;
    private User $cajero;

    protected function setUp(): void
    {
        parent::setUp();

        $company = Company::create(['name' => 'Tadaima Test']);
        $store = Store::create([
            'company_id' => $company->id, 'name' => 'Tienda A', 'active' => true,
        ]);

        $this->admin  = $this->makeUser($company->id, 'admin@test.com', 'admin', null);
        $this->cajero = $this->makeUser($company->id, 'cajero@test.com', 'cajero', $store->id);
    }

    public function test_newsletter_captura_solo_email(): void
    {
        $resp = $this->postJson('/api/v1/us/leads', [
            'source' => 'newsletter',
            'email'  => 'fan@example.com',
        ])->assertCreated();

        $resp->assertJsonPath('success', true);
        // El copy de éxito lo muestra el sitio ("You're in — welcome home!").
        $this->assertStringContainsString('welcome home', (string) $resp->json('message'));

        $this->assertDatabaseHas('us_leads', [
            'source' => 'newsletter', 'email' => 'fan@example.com',
            'name' => null, 'message' => null,
        ]);
    }

    public function test_contact_requiere_nombre_asunto_y_mensaje(): void
    {
        // Contact completo → 201.
        $this->postJson('/api/v1/us/leads', [
            'source'  => 'contact',
            'name'    => 'John Doe',
            'email'   => 'john@example.com',
            'subject' => 'Support',
            'message' => 'Do you have the Rengoku figure in stock?',
        ])->assertCreated();

        $this->assertDatabaseHas('us_leads', [
            'source' => 'contact', 'name' => 'John Doe',
            'email' => 'john@example.com', 'subject' => 'Support',
        ]);

        // Contact sin mensaje → 422.
        $this->postJson('/api/v1/us/leads', [
            'source' => 'contact', 'name' => 'John', 'email' => 'john@example.com',
            'subject' => 'Support',
        ])->assertStatus(422)->assertJsonStructure(['errors' => ['message']]);

        // Contact sin asunto → 422 (el formulario original lo marca con *).
        $this->postJson('/api/v1/us/leads', [
            'source' => 'contact', 'name' => 'John', 'email' => 'john@example.com',
            'message' => 'Hello!',
        ])->assertStatus(422)->assertJsonStructure(['errors' => ['subject']]);

        // Newsletter NO exige nombre/mensaje (ya cubierto arriba); email malo → 422.
        $this->postJson('/api/v1/us/leads', [
            'source' => 'newsletter', 'email' => 'no-es-email',
        ])->assertStatus(422)->assertJsonStructure(['errors' => ['email']]);

        // Source inválido → 422.
        $this->postJson('/api/v1/us/leads', [
            'source' => 'spam', 'email' => 'x@example.com',
        ])->assertStatus(422);
    }

    public function test_marketing_consent_se_guarda_y_default_es_false(): void
    {
        // Checkbox marcado en el newsletter → consentimiento explícito.
        $this->postJson('/api/v1/us/leads', [
            'source'            => 'newsletter',
            'email'             => 'optin@example.com',
            'marketing_consent' => true,
        ])->assertCreated();

        $this->assertDatabaseHas('us_leads', [
            'email' => 'optin@example.com', 'marketing_consent' => true,
        ]);

        // Sin el campo (o sin marcarlo) NUNCA se asume el consentimiento.
        $this->postJson('/api/v1/us/leads', [
            'source' => 'newsletter', 'email' => 'nooptin@example.com',
        ])->assertCreated();

        $this->assertDatabaseHas('us_leads', [
            'email' => 'nooptin@example.com', 'marketing_consent' => false,
        ]);

        // La bandeja admin lo expone para poder segmentar los envíos.
        $this->actingAs($this->admin)->getJson('/api/v1/us/leads')
            ->assertOk()
            ->assertJsonPath('data.0.marketing_consent', false)
            ->assertJsonPath('data.1.marketing_consent', true);
    }

    public function test_honeypot_rechaza_bots(): void
    {
        $this->postJson('/api/v1/us/leads', [
            'source'  => 'newsletter',
            'email'   => 'bot@example.com',
            'website' => 'https://spam.example.com',
        ])->assertStatus(422)->assertJsonPath('success', false);

        $this->assertDatabaseCount('us_leads', 0);
    }

    public function test_admin_ve_bandeja_con_filtro_por_source(): void
    {
        $this->postJson('/api/v1/us/leads', [
            'source' => 'newsletter', 'email' => 'fan@example.com',
        ])->assertCreated();
        $this->postJson('/api/v1/us/leads', [
            'source' => 'contact', 'name' => 'John Doe',
            'email' => 'john@example.com', 'subject' => 'Support', 'message' => 'Hello!',
        ])->assertCreated();

        // Sin token → 401; no-admin → 403.
        $this->getJson('/api/v1/us/leads')->assertUnauthorized();
        $this->actingAs($this->cajero)->getJson('/api/v1/us/leads')->assertForbidden();

        // Admin: todos, más nuevos primero.
        $resp = $this->actingAs($this->admin)->getJson('/api/v1/us/leads')->assertOk();
        $resp->assertJsonCount(2, 'data');
        $resp->assertJsonPath('data.0.source', 'contact');
        $resp->assertJsonPath('data.0.name', 'John Doe');
        $resp->assertJsonPath('data.0.message', 'Hello!');
        $resp->assertJsonPath('data.1.source', 'newsletter');
        $resp->assertJsonPath('data.1.email', 'fan@example.com');

        // Filtro por source.
        $this->actingAs($this->admin)->getJson('/api/v1/us/leads?source=newsletter')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.email', 'fan@example.com');
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private function makeUser(int $companyId, string $email, string $roleName, ?int $storeId): User
    {
        $user = User::create([
            'name' => $email, 'email' => $email, 'password' => bcrypt('password'),
            'company_id' => $companyId, 'store_id' => $storeId, 'active' => true,
        ]);

        $roleId = DB::table('roles')->where('name', $roleName)->value('id')
            ?? DB::table('roles')->insertGetId([
                'name' => $roleName, 'guard_name' => 'api',
                'created_at' => now(), 'updated_at' => now(),
            ]);

        DB::table('model_has_roles')->insert([
            'role_id' => $roleId, 'model_type' => User::class, 'model_id' => $user->id,
        ]);

        return $user;
    }
}
