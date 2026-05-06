<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

/**
 * Integración con el sistema de socios Tadaima (Supabase).
 *
 * Requiere en .env:
 *   TADAIMA_SUPABASE_URL=https://<project>.supabase.co
 *   TADAIMA_SUPABASE_SERVICE_KEY=<service_role key>
 *
 * La service_role key bypasa RLS — nunca exponerla en el frontend.
 */
class ExternalCardController extends Controller
{
    /**
     * GET /external/card/{code}
     *
     * Busca un socio por id_socio en Supabase.
     * Devuelve los datos mapeados al shape ExternalCardLookup del frontend.
     */
    public function lookup(string $code): JsonResponse
    {
        $code = strtoupper(trim($code));

        if (empty($code)) {
            return $this->error('Código de membresía inválido.', 422);
        }

        $supabaseUrl = rtrim((string) config('services.tadaima_loyalty.url'), '/');
        $serviceKey  = (string) config('services.tadaima_loyalty.service_key');

        // Sin configuración — usar stub de desarrollo
        if (empty($supabaseUrl) || empty($serviceKey)) {
            return $this->stubLookup($code);
        }

        $response = Http::withHeaders([
            'apikey'        => $serviceKey,
            'Authorization' => 'Bearer ' . $serviceKey,
        ])->get("{$supabaseUrl}/rest/v1/socios", [
            'select'   => '*,usuarios(*)',
            'id_socio' => 'eq.' . $code,
        ]);

        if (! $response->successful()) {
            \Log::warning('Supabase lookup error', [
                'code'   => $code,
                'status' => $response->status(),
                'body'   => $response->body(),
            ]);
            return $this->error('Error al consultar el sistema de socios.', 502);
        }

        $rows = $response->json();

        if (empty($rows)) {
            return $this->error('Membresía no encontrada.', 404);
        }

        $socio   = $rows[0];
        // Supabase devuelve el objeto relacionado directamente (no array) en join 1-1
        $rawUsuario = $socio['usuarios'] ?? [];
        $usuario = is_array($rawUsuario) && array_is_list($rawUsuario)
            ? ($rawUsuario[0] ?? [])
            : (array) $rawUsuario;

        return $this->success($this->mapSocio($socio, $usuario));
    }

    /**
     * POST /external/customer
     *
     * Registra un cliente en el sistema externo (not implemented yet).
     */
    public function register(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'  => ['required', 'string', 'max:200'],
            'email' => ['required', 'email', 'max:200'],
            'phone' => ['nullable', 'string', 'max:20'],
        ]);

        // TODO: POST al sistema Supabase cuando esté disponible
        return $this->success([
            'external_member_id' => 'EXT-' . strtoupper(Str::random(8)),
            'name'               => $data['name'],
            'email'              => $data['email'],
            'phone'              => $data['phone'] ?? null,
        ], 'Cliente registrado.', 201);
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    /**
     * Mapea la fila de Supabase al shape ExternalCardLookup del frontend.
     * Ajustar los nombres de columna si difieren del esquema real.
     */
    private function mapSocio(array $socio, array $usuario): array
    {
        // Schema confirmado: nombre/apellidos en usuarios, id_socio/nivel/activo/vigencia en socios
        $nombre   = $usuario['nombre']   ?? '';
        $apellido = $usuario['apellidos'] ?? '';
        $fullName = trim("{$nombre} {$apellido}") ?: ($socio['id_socio'] ?? '');

        return [
            'external_member_id' => (string) ($socio['id_socio'] ?? ''),
            'name'               => $fullName,
            'email'              => (string) ($usuario['email'] ?? ''),
            'phone'              => isset($usuario['telefono']) ? (string) $usuario['telefono'] : null,
            'estatus'            => $socio['activo'] ? 'ACTIVO' : 'INACTIVO',
            'vigencia'           => $socio['fecha_vencimiento_membresia'] ?? null,
            'nivel'              => $socio['nivel_membresia'] ?? null,
        ];
    }

    /**
     * Stub determinístico para cuando no hay config de Supabase (dev local).
     */
    private function stubLookup(string $code): JsonResponse
    {
        if (! preg_match('/^[A-Za-z0-9]{4,20}$/', $code)) {
            return $this->error('Código de membresía inválido.', 422);
        }

        $hash  = crc32($code);
        $names = ['Ana García', 'Luis Martínez', 'María López', 'Carlos Rodríguez', 'Sofia Hernández'];
        $name  = $names[abs($hash) % count($names)];

        return $this->success([
            'external_member_id' => $code,
            'name'               => $name,
            'email'              => strtolower($code) . '@stub.tadaima.local',
            'phone'              => '55' . str_pad((string) (abs($hash) % 100000000), 8, '0', STR_PAD_LEFT),
            'estatus'            => 'ACTIVO',
            'vigencia'           => null,
        ]);
    }
}
