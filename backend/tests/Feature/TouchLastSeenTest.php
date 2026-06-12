<?php

namespace Tests\Feature;

use App\Models\Company;
use App\Models\Store;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\DB;
use Tests\TestCase;

/**
 * Heartbeat de presencia (users.last_seen_at) — QA Joel 2026-06-11: el gerente
 * no veía a su cajero con caja abierta en "Cajeros conectados".
 *
 * Causa doble en TouchLastSeen:
 *  1. Carbon 3: diffInSeconds es CON SIGNO → $now->diffInSeconds($pasado) da
 *     negativo y el dedupe nunca volvía a escribir después del primer touch.
 *  2. El middleware corría ANTES de auth:sanctum → con bearer token,
 *     $request->user() era null en la ida. Ahora toca después de $next.
 */
class TouchLastSeenTest extends TestCase
{
    use RefreshDatabase;

    private function makeUser(): User
    {
        $company = Company::create(['name' => 'Tadaima Test']);
        $store = Store::create([
            'company_id' => $company->id,
            'name' => 'Tienda Centro',
            'active' => true,
        ]);

        $user = User::create([
            'name' => 'Cajero',
            'email' => 'cajero@test.com',
            'password' => bcrypt('password'),
            'company_id' => $company->id,
            'store_id' => $store->id,
            'active' => true,
        ]);

        $roleId = DB::table('roles')->insertGetId([
            'name' => 'cajero', 'guard_name' => 'api',
            'created_at' => now(), 'updated_at' => now(),
        ]);
        DB::table('model_has_roles')->insert([
            'role_id' => $roleId, 'model_type' => User::class, 'model_id' => $user->id,
        ]);

        return $user;
    }

    public function test_bearer_request_refreshes_stale_last_seen_at(): void
    {
        $user = $this->makeUser();
        // Simula el estado roto de prod: un last_seen_at viejo que el dedupe
        // con diff negativo nunca volvía a actualizar.
        $user->forceFill(['last_seen_at' => now()->subMinutes(30)])->saveQuietly();

        $token = $user->createToken('test')->plainTextToken;

        $this->withToken($token)
            ->getJson('/api/v1/auth/me')
            ->assertOk();

        $fresh = $user->fresh();
        $this->assertNotNull($fresh->last_seen_at);
        $this->assertTrue(
            $fresh->last_seen_at->gt(now()->subMinute()),
            "last_seen_at no se refrescó (quedó en {$fresh->last_seen_at})"
        );
    }

    public function test_stale_user_reappears_in_online_after_request(): void
    {
        $user = $this->makeUser();
        $user->forceFill(['last_seen_at' => now()->subMinutes(30)])->saveQuietly();

        $token = $user->createToken('test')->plainTextToken;

        // Cualquier request autenticada lo marca presente…
        $this->withToken($token)->getJson('/api/v1/auth/me')->assertOk();

        // …y /users/online (threshold 2 min) ya lo lista.
        $this->withToken($token)
            ->getJson('/api/v1/users/online')
            ->assertOk()
            ->assertJsonFragment(['id' => $user->id]);
    }
}
