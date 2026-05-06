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
     * GET /external/customers?q={term}
     *
     * Busca socios por id_socio, nombre, apellidos o email.
     * Devuelve hasta 10 resultados.
     */
    public function search(Request $request): JsonResponse
    {
        $q = trim((string) $request->query('q', ''));

        if (mb_strlen($q) < 2) {
            return $this->success([]);
        }

        $supabaseUrl = rtrim((string) config('services.tadaima_loyalty.url'), '/');
        $serviceKey  = (string) config('services.tadaima_loyalty.service_key');

        if (empty($supabaseUrl) || empty($serviceKey)) {
            return $this->success($this->stubSearch($q));
        }

        $headers = [
            'apikey'        => $serviceKey,
            'Authorization' => 'Bearer ' . $serviceKey,
        ];

        $results = [];
        $seenIds = [];

        // 1. Buscar por id_socio (partial match)
        $sociosRes = Http::withHeaders($headers)->get("{$supabaseUrl}/rest/v1/socios", [
            'select'   => '*,usuarios(*)',
            'id_socio' => 'ilike.*' . $q . '*',
            'limit'    => '10',
        ]);

        if ($sociosRes->successful()) {
            foreach ($sociosRes->json() as $row) {
                $rawU   = $row['usuarios'] ?? [];
                $usuario = is_array($rawU) && array_is_list($rawU) ? ($rawU[0] ?? []) : (array) $rawU;
                $mapped  = $this->mapSocio($row, $usuario);
                $id      = $mapped['external_member_id'];
                if ($id && ! in_array($id, $seenIds, true)) {
                    $seenIds[] = $id;
                    $results[] = $mapped;
                }
            }
        }

        // 2. Buscar por nombre / apellidos / correo vía tabla usuarios
        $usuariosRes = Http::withHeaders($headers)->get("{$supabaseUrl}/rest/v1/usuarios", [
            'select' => 'id,nombre,apellidos,email,telefono,socios(*)',
            'or'     => "(nombre.ilike.*{$q}*,apellidos.ilike.*{$q}*,email.ilike.*{$q}*)",
            'limit'  => '10',
        ]);

        if ($usuariosRes->successful()) {
            foreach ($usuariosRes->json() as $usuario) {
                $socioRaw  = $usuario['socios'] ?? [];
                $socioList = is_array($socioRaw) && array_is_list($socioRaw) ? $socioRaw : [(array) $socioRaw];
                if (empty($socioList) || empty($socioList[0])) continue;

                $socio = $socioList[0];
                $id    = (string) ($socio['id_socio'] ?? '');
                if (! $id || in_array($id, $seenIds, true)) continue;

                $seenIds[] = $id;
                $results[] = $this->mapSocio($socio, $usuario);
            }
        }

        return $this->success(array_values(array_slice($results, 0, 10)));
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
     * Stub de búsqueda para desarrollo local.
     */
    private function stubSearch(string $q): array
    {
        $names = [
            ['Ana García',       'TAD10000001', 'ana.garcia@stub.local',   '5510000001'],
            ['Luis Martínez',    'TAD10000002', 'luis.martinez@stub.local','5510000002'],
            ['María López',      'TAD10000003', 'maria.lopez@stub.local',  '5510000003'],
            ['Carlos Rodríguez', 'TAD10000004', 'carlos.r@stub.local',     '5510000004'],
            ['Sofia Hernández',  'TAD10000005', 'sofia.h@stub.local',      '5510000005'],
        ];

        $q = strtolower($q);
        return array_values(array_filter(array_map(fn ($n) => [
            'external_member_id' => $n[1],
            'name'               => $n[0],
            'email'              => $n[2],
            'phone'              => $n[3],
            'estatus'            => 'ACTIVO',
            'vigencia'           => null,
            'nivel'              => null,
        ], $names), fn ($r) =>
            str_contains(strtolower($r['name']), $q) ||
            str_contains(strtolower($r['external_member_id']), $q) ||
            str_contains(strtolower($r['email']), $q)
        ));
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
