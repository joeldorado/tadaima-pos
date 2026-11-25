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
 * Freno de ráfagas antes de autenticar (2026-11-24). Una PC mandó cientos de
 * `GET /inventory` por segundo y cada 429 igual abría conexión a Supabase
 * (Sanctum autentica antes del throttle). Estas pruebas fijan que el rechazo
 * llega ANTES de la base y que no castiga a otros tokens.
 */
class ApiBurstGuardTest extends TestCase
{
    use RefreshDatabase;

    private function makeToken(string $email): string
    {
        $company = Company::firstOrCreate(['name' => 'Tadaima Test']);
        $store = Store::firstOrCreate(
            ['name' => 'Tienda Centro'],
            ['company_id' => $company->id, 'active' => true],
        );
        $user = User::create([
            'name' => 'Cajero', 'email' => $email, 'password' => bcrypt('x'),
            'company_id' => $company->id, 'store_id' => $store->id, 'active' => true,
        ]);

        return $user->createToken('test')->plainTextToken;
    }

    private function hit(string $token): \Illuminate\Testing\TestResponse
    {
        return $this->withHeader('Authorization', 'Bearer ' . $token)
            ->getJson('/api/v1/notifications');
    }

    public function test_rejects_the_burst_with_429_without_touching_the_database(): void
    {
        config(['cache.api_burst_limits' => '3:10']);
        $token = $this->makeToken('a@test.com');

        for ($i = 0; $i < 3; $i++) {
            $this->assertNotSame(429, $this->hit($token)->status());
        }

        $queries = 0;
        DB::listen(function () use (&$queries): void {
            $queries++;
        });

        $response = $this->hit($token);

        $response->assertStatus(429);
        $this->assertTrue($response->headers->has('Retry-After'));
        $this->assertSame(0, $queries, 'Un 429 del freno no debe consultar la base');
    }

    public function test_rejects_before_authenticating(): void
    {
        config(['cache.api_burst_limits' => '2:10']);

        $this->hit('token-que-no-existe')->assertStatus(401);
        $this->hit('token-que-no-existe')->assertStatus(401);
        $this->hit('token-que-no-existe')->assertStatus(429);
    }

    public function test_another_token_is_not_affected_by_the_burst(): void
    {
        config(['cache.api_burst_limits' => '2:10']);
        $noisy = $this->makeToken('a@test.com');
        $quiet = $this->makeToken('b@test.com');

        $this->hit($noisy);
        $this->hit($noisy);
        $this->hit($noisy)->assertStatus(429);

        $this->assertNotSame(429, $this->hit($quiet)->status());
    }

    public function test_every_window_counts(): void
    {
        config(['cache.api_burst_limits' => '100:10,2:60']);
        $token = $this->makeToken('a@test.com');

        $this->hit($token);
        $this->hit($token);
        $this->hit($token)->assertStatus(429);
    }

    public function test_empty_config_turns_the_guard_off(): void
    {
        config(['cache.api_burst_limits' => '']);
        $token = $this->makeToken('a@test.com');

        for ($i = 0; $i < 5; $i++) {
            $this->assertNotSame(429, $this->hit($token)->status());
        }
    }
}
