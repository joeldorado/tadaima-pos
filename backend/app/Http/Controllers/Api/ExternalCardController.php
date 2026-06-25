<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Services\TadaimaMemberService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * Integración con el sistema de socios Tadaima (Supabase, SOLO LECTURA).
 *
 * La lógica de Supabase vive en App\Services\TadaimaMemberService (reusada por
 * CustomerController::refreshMember para mantener fresco el snapshot local).
 */
class ExternalCardController extends Controller
{
    public function __construct(private readonly TadaimaMemberService $members)
    {
    }

    /**
     * GET /external/card/{code}
     *
     * Busca un socio por id_socio en Supabase y devuelve el shape
     * ExternalCardLookup del frontend.
     */
    public function lookup(string $code): JsonResponse
    {
        $code = strtoupper(trim($code));

        if ($code === '') {
            return $this->error('Código de membresía inválido.', 422);
        }

        try {
            $socio = $this->members->lookup($code);
        } catch (RuntimeException) {
            return $this->error('Error al consultar el sistema de socios.', 502);
        }

        if ($socio === null) {
            return $this->error('Membresía no encontrada.', 404);
        }

        return $this->success($socio);
    }

    /**
     * GET /external/customers?q={term}
     *
     * Busca socios por id_socio, nombre, apellidos o email (hasta 10).
     */
    public function search(Request $request): JsonResponse
    {
        return $this->success($this->members->search((string) $request->query('q', '')));
    }

    /**
     * POST /external/customer
     *
     * Registra un cliente en el sistema externo (stub — Supabase es solo lectura).
     */
    public function register(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'  => ['required', 'string', 'max:200'],
            'email' => ['required', 'email', 'max:200'],
            'phone' => ['nullable', 'string', 'max:20'],
        ]);

        // TODO: POST al sistema Supabase cuando esté disponible (hoy: solo lectura).
        return $this->success([
            'external_member_id' => 'EXT-' . strtoupper(Str::random(8)),
            'name'               => $data['name'],
            'email'              => $data['email'],
            'phone'              => $data['phone'] ?? null,
        ], 'Cliente registrado.', 201);
    }
}
