<?php

declare(strict_types=1);

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use RuntimeException;

/**
 * Integración (SOLO LECTURA) con el sistema de socios Tadaima en Supabase.
 *
 * Requiere en .env:
 *   TADAIMA_SUPABASE_URL=https://<project>.supabase.co
 *   TADAIMA_SUPABASE_SERVICE_KEY=<service_role key>
 *
 * La service_role key bypasa RLS — nunca exponerla en el frontend. Este servicio
 * NUNCA escribe a Supabase: solo lee socios/usuarios y mapea al shape que consume
 * el POS. Lo usan ExternalCardController (búsqueda/lookup) y CustomerController
 * (refresh del snapshot local de un socio ya importado).
 */
class TadaimaMemberService
{
    /**
     * Busca un socio por id_socio. Devuelve el shape mapeado o null si no existe.
     *
     * @return array<string, mixed>|null
     * @throws RuntimeException si Supabase responde con error (credenciales/5xx).
     */
    public function lookup(string $code): ?array
    {
        $code = strtoupper(trim($code));
        if ($code === '') {
            return null;
        }

        [$url, $key] = $this->config();
        if ($url === '' || $key === '') {
            return $this->stubLookup($code);
        }

        $response = Http::withHeaders($this->headers($key))
            ->get("{$url}/rest/v1/socios", [
                'select'   => '*,usuarios(*)',
                'id_socio' => 'eq.' . $code,
            ]);

        if (! $response->successful()) {
            Log::warning('Supabase lookup error', [
                'code'   => $code,
                'status' => $response->status(),
                'body'   => $response->body(),
            ]);
            throw new RuntimeException('Error al consultar el sistema de socios.');
        }

        $rows = $response->json();
        if (empty($rows)) {
            return null;
        }

        $socio = $rows[0];

        return $this->mapSocio($socio, $this->extractUsuario($socio['usuarios'] ?? []));
    }

    /**
     * Busca socios por id_socio, nombre, apellidos o email. Hasta 10 resultados.
     *
     * @return array<int, array<string, mixed>>
     */
    public function search(string $q): array
    {
        $q = trim($q);
        if (mb_strlen($q) < 2) {
            return [];
        }

        [$url, $key] = $this->config();
        if ($url === '' || $key === '') {
            return $this->stubSearch($q);
        }

        $headers = $this->headers($key);
        $results = [];
        $seenIds = [];

        // 1. Buscar por id_socio (partial match).
        $sociosRes = Http::withHeaders($headers)->get("{$url}/rest/v1/socios", [
            'select'   => '*,usuarios(*)',
            'id_socio' => 'ilike.*' . $q . '*',
            'limit'    => '10',
        ]);

        if ($sociosRes->successful()) {
            foreach ($sociosRes->json() as $row) {
                $mapped = $this->mapSocio($row, $this->extractUsuario($row['usuarios'] ?? []));
                $id     = $mapped['external_member_id'];
                if ($id && ! in_array($id, $seenIds, true)) {
                    $seenIds[] = $id;
                    $results[] = $mapped;
                }
            }
        }

        // 2. Buscar por nombre / apellidos / correo vía tabla usuarios.
        $usuariosRes = Http::withHeaders($headers)->get("{$url}/rest/v1/usuarios", [
            'select' => 'id,nombre,apellidos,email,telefono,socios(*)',
            'or'     => "(nombre.ilike.*{$q}*,apellidos.ilike.*{$q}*,email.ilike.*{$q}*)",
            'limit'  => '10',
        ]);

        if ($usuariosRes->successful()) {
            foreach ($usuariosRes->json() as $usuario) {
                $socioRaw  = $usuario['socios'] ?? [];
                $socioList = is_array($socioRaw) && array_is_list($socioRaw) ? $socioRaw : [(array) $socioRaw];
                if (empty($socioList) || empty($socioList[0])) {
                    continue;
                }

                $socio = $socioList[0];
                $id    = (string) ($socio['id_socio'] ?? '');
                if (! $id || in_array($id, $seenIds, true)) {
                    continue;
                }

                $seenIds[] = $id;
                $results[] = $this->mapSocio($socio, $usuario);
            }
        }

        return array_values(array_slice($results, 0, 10));
    }

    // ─── Helpers ──────────────────────────────────────────────────────────────

    /** @return array{0: string, 1: string} [url, serviceKey] */
    private function config(): array
    {
        return [
            rtrim((string) config('services.tadaima_loyalty.url'), '/'),
            (string) config('services.tadaima_loyalty.service_key'),
        ];
    }

    /** @return array<string, string> */
    private function headers(string $key): array
    {
        return ['apikey' => $key, 'Authorization' => 'Bearer ' . $key];
    }

    /**
     * Supabase devuelve el objeto relacionado directamente (no array) en join 1-1.
     *
     * @param  mixed  $raw
     * @return array<string, mixed>
     */
    private function extractUsuario($raw): array
    {
        return is_array($raw) && array_is_list($raw) ? ($raw[0] ?? []) : (array) $raw;
    }

    /**
     * Mapea la fila de Supabase al shape ExternalCardLookup del frontend.
     *
     * @param  array<string, mixed>  $socio
     * @param  array<string, mixed>  $usuario
     * @return array<string, mixed>
     */
    private function mapSocio(array $socio, array $usuario): array
    {
        // Schema confirmado: nombre/apellidos en usuarios; id_socio/nivel/activo/vigencia en socios.
        $nombre   = $usuario['nombre']    ?? '';
        $apellido = $usuario['apellidos'] ?? '';
        $fullName = trim("{$nombre} {$apellido}") ?: ($socio['id_socio'] ?? '');

        return [
            'external_member_id' => (string) ($socio['id_socio'] ?? ''),
            'name'               => $fullName,
            'email'              => (string) ($usuario['email'] ?? ''),
            'phone'              => isset($usuario['telefono']) ? (string) $usuario['telefono'] : null,
            'estatus'            => ($socio['activo'] ?? false) ? 'ACTIVO' : 'INACTIVO',
            'vigencia'           => $socio['fecha_vencimiento_membresia'] ?? null,
            'nivel'              => $socio['nivel_membresia'] ?? null,
            // Reservado: cuando se confirme la columna de adeudo en Supabase
            // (select=* ya la trae), mapearla aquí y activar el gating por deuda.
            'debt'               => null,
        ];
    }

    /**
     * Stub de búsqueda para desarrollo local (sin config de Supabase).
     *
     * @return array<int, array<string, mixed>>
     */
    private function stubSearch(string $q): array
    {
        $names = [
            ['Ana García',       'TAD10000001', 'ana.garcia@stub.local',    '5510000001'],
            ['Luis Martínez',    'TAD10000002', 'luis.martinez@stub.local', '5510000002'],
            ['María López',      'TAD10000003', 'maria.lopez@stub.local',   '5510000003'],
            ['Carlos Rodríguez', 'TAD10000004', 'carlos.r@stub.local',      '5510000004'],
            ['Sofia Hernández',  'TAD10000005', 'sofia.h@stub.local',       '5510000005'],
        ];

        $q = strtolower($q);

        return array_values(array_filter(array_map(fn ($n) => [
            'external_member_id' => $n[1],
            'name'               => $n[0],
            'email'              => $n[2],
            'phone'              => $n[3],
            'estatus'            => 'ACTIVO',
            'vigencia'           => null,
            'nivel'              => 'b',
            'debt'               => null,
        ], $names), fn ($r) =>
            str_contains(strtolower($r['name']), $q) ||
            str_contains(strtolower($r['external_member_id']), $q) ||
            str_contains(strtolower($r['email']), $q)
        ));
    }

    /**
     * Stub determinístico para cuando no hay config de Supabase (dev local).
     *
     * @return array<string, mixed>|null
     */
    private function stubLookup(string $code): ?array
    {
        if (! preg_match('/^[A-Za-z0-9]{4,20}$/', $code)) {
            return null;
        }

        $hash  = crc32($code);
        $names = ['Ana García', 'Luis Martínez', 'María López', 'Carlos Rodríguez', 'Sofia Hernández'];
        $name  = $names[abs($hash) % count($names)];

        return [
            'external_member_id' => $code,
            'name'               => $name,
            'email'              => strtolower($code) . '@stub.tadaima.local',
            'phone'              => '55' . str_pad((string) (abs($hash) % 100000000), 8, '0', STR_PAD_LEFT),
            'estatus'            => 'ACTIVO',
            'vigencia'           => null,
            'nivel'              => 'b',
            'debt'               => null,
        ];
    }
}
