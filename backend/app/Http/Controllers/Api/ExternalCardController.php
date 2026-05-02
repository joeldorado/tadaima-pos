<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * STUB — simulates an external Tadaima loyalty card API.
 *
 * Replace with a real HTTP call to the Tadaima loyalty system when available.
 * Gate behind env var TADAIMA_USE_EXTERNAL_CARD_STUB=true in production
 * to prevent accidental use.
 */
class ExternalCardController extends Controller
{
    /**
     * GET /external/card/{code}
     *
     * Returns deterministic fake customer data derived from the card code.
     * The stub generates consistent data so the same code always returns the same customer,
     * making it safe to use in integration tests.
     */
    public function lookup(string $code): JsonResponse
    {
        // Validate format: alphanumeric 8-16 chars
        if (! preg_match('/^[A-Za-z0-9]{8,16}$/', $code)) {
            return $this->error('Código de tarjeta inválido.', 422);
        }

        // Generate deterministic stub data from the code (consistent across calls)
        $hash  = crc32(strtoupper($code));
        $names = ['Ana García', 'Luis Martínez', 'María López', 'Carlos Rodríguez', 'Sofia Hernández'];
        $name  = $names[abs($hash) % count($names)];

        return $this->success([
            'external_member_id' => strtoupper($code),
            'name'               => $name,
            'email'              => strtolower($code) . '@stub.tadaima.local',
            'phone'              => '55' . str_pad((string) (abs($hash) % 100000000), 8, '0', STR_PAD_LEFT),
        ]);
    }

    /**
     * POST /external/customer
     *
     * Echoes the submitted customer data back with a generated external_member_id.
     * Simulates registering a new customer in the external loyalty system.
     */
    public function register(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'  => ['required', 'string', 'max:200'],
            'email' => ['required', 'email', 'max:200'],
            'phone' => ['nullable', 'string', 'max:20'],
        ]);

        return $this->success([
            'external_member_id' => 'EXT-' . strtoupper(Str::random(8)),
            'name'               => $data['name'],
            'email'              => $data['email'],
            'phone'              => $data['phone'] ?? null,
        ], 'Cliente registrado en sistema externo (stub).', 201);
    }
}
