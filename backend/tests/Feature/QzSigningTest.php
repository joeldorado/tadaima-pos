<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * Firma de requests de QZ Tray (impresión silenciosa, 2026-07-30).
 *
 * El front manda el payload que arma qz-tray.js (incluye el HTML completo del
 * ticket) y recibe una firma SHA512withRSA en base64 que QZ valida contra el
 * certificado instalado en cada caja. La llave privada vive SOLO en el backend
 * (env QZ_PRIVATE_KEY_B64 / QZ_CERTIFICATE_B64, PEM en base64 una línea).
 */
class QzSigningTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    /** @var resource|\OpenSSLAsymmetricKey */
    private $keypair;

    protected function setUp(): void
    {
        parent::setUp();

        $company = Company::create(['name' => 'Tadaima Test']);
        $store = Store::create(['company_id' => $company->id, 'name' => 'Tienda Test', 'active' => true]);
        $this->user = User::create([
            'name' => 'Cajero', 'email' => 'cajero@test.com', 'password' => bcrypt('x'),
            'company_id' => $company->id, 'store_id' => $store->id, 'active' => true,
        ]);

        // Keypair efímero por test — la config se inyecta igual que en prod
        // (PEM en base64 una línea), sin tocar env reales.
        $this->keypair = openssl_pkey_new(['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA]);
        openssl_pkey_export($this->keypair, $privatePem);

        $csr = openssl_csr_new(['commonName' => 'Tadaima POS Test'], $this->keypair, ['digest_alg' => 'sha256']);
        $x509 = openssl_csr_sign($csr, null, $this->keypair, 365, ['digest_alg' => 'sha256']);
        openssl_x509_export($x509, $certPem);

        config()->set('services.qz.private_key', base64_encode($privatePem));
        config()->set('services.qz.certificate', base64_encode($certPem));
    }

    public function test_sign_returns_signature_that_verifies_with_public_key(): void
    {
        $payload = json_encode(['call' => 'print', 'params' => ['<html>ticket</html>'], 'timestamp' => 1753900000000]);

        $response = $this->actingAs($this->user)->postJson('/api/v1/qz/sign', ['request' => $payload]);

        $response->assertOk()->assertJsonPath('success', true);
        $signature = base64_decode($response->json('data.signature'), true);
        $this->assertNotFalse($signature);

        $publicKey = openssl_pkey_get_public(openssl_pkey_get_details($this->keypair)['key']);
        $this->assertSame(1, openssl_verify($payload, $signature, $publicKey, OPENSSL_ALGO_SHA512));
    }

    public function test_sign_requires_authentication(): void
    {
        $this->postJson('/api/v1/qz/sign', ['request' => 'x'])->assertUnauthorized();
        $this->getJson('/api/v1/qz/cert')->assertUnauthorized();
    }

    public function test_sign_validates_missing_request_field(): void
    {
        $this->actingAs($this->user)->postJson('/api/v1/qz/sign', [])->assertStatus(422);
    }

    public function test_sign_accepts_large_ticket_payload(): void
    {
        // El toSign incluye el HTML completo del ticket — ~100KB debe pasar.
        $payload = str_repeat('<tr><td>Producto de prueba</td><td>$1,234.56</td></tr>', 2000);

        $this->actingAs($this->user)
            ->postJson('/api/v1/qz/sign', ['request' => $payload])
            ->assertOk()
            ->assertJsonPath('success', true);
    }

    public function test_sign_returns_503_when_not_configured(): void
    {
        config()->set('services.qz.private_key', null);

        $this->actingAs($this->user)
            ->postJson('/api/v1/qz/sign', ['request' => 'x'])
            ->assertStatus(503);
    }

    public function test_cert_returns_public_certificate_pem(): void
    {
        $response = $this->actingAs($this->user)->getJson('/api/v1/qz/cert');

        $response->assertOk()->assertJsonPath('success', true);
        $this->assertStringContainsString('BEGIN CERTIFICATE', $response->json('data.certificate'));
    }

    public function test_cert_returns_503_when_not_configured(): void
    {
        config()->set('services.qz.certificate', null);

        $this->actingAs($this->user)->getJson('/api/v1/qz/cert')->assertStatus(503);
    }
}
