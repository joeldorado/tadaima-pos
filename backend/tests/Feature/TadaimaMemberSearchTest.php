<?php

declare(strict_types=1);

namespace Tests\Feature;

use App\Services\TadaimaMemberService;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * Búsqueda de socios Tadaima (2026-09-30): "Andrea Lizarraga Navarro" no salía
 * porque en la base de socios está como "Lizárraga" y el nombre completo cruza
 * nombre + apellidos. La base de socios es de SOLO LECTURA: aquí se simula con
 * Http::fake y se revisa qué consulta arma el POS y qué filtra.
 */
class TadaimaMemberSearchTest extends TestCase
{
    /** @var list<array<string, string>> Queries recibidas por endpoint "socios"/"usuarios". */
    private array $calls = [];

    protected function setUp(): void
    {
        parent::setUp();
        config([
            'services.tadaima_loyalty.url'         => 'https://socios.test',
            'services.tadaima_loyalty.service_key' => 'test-key',
        ]);
    }

    private function usuario(string $nombre, string $apellidos, string $idSocio, bool $activo = true): array
    {
        return [
            'id' => $idSocio, 'nombre' => $nombre, 'apellidos' => $apellidos,
            'email' => strtolower(explode(' ', $nombre)[0]) . '@mail.test', 'telefono' => null,
            'socios' => [['id_socio' => $idSocio, 'activo' => $activo, 'nivel_membresia' => 'b', 'fecha_vencimiento_membresia' => null]],
        ];
    }

    /**
     * Simula la base de socios. `$usuarios` recibe si es la consulta con comodín
     * (la 2a a `usuarios`; la 1a es la exacta) y regresa los renglones.
     *
     * @param callable(bool): list<array<string, mixed>> $usuarios
     * @param list<array<string, mixed>>                 $socios   Respuesta del endpoint socios.
     */
    private function fakeSocios(callable $usuarios, array $socios = []): void
    {
        Http::fake(function (Request $request) use ($usuarios, $socios) {
            parse_str((string) parse_url($request->url(), PHP_URL_QUERY), $query);
            $endpoint = str_contains($request->url(), '/rest/v1/usuarios') ? 'usuarios' : 'socios';
            $this->calls[] = ['endpoint' => $endpoint] + $query;
            if ($endpoint === 'socios') {
                return Http::response($socios);
            }

            return Http::response($usuarios(count($this->usuariosCalls()) > 1));
        });
    }

    /** @return list<array<string, string>> */
    private function usuariosCalls(): array
    {
        return array_values(array_filter($this->calls, fn (array $c) => $c['endpoint'] === 'usuarios'));
    }

    public function test_full_name_without_accent_finds_the_member(): void
    {
        // Como en prod: "lizarraga" exacto NO encuentra "Lizárraga"; el comodín sí
        // (y trae de más: "l_z_rr_g_" también empata con "Luzorrigo").
        $this->fakeSocios(fn (bool $wildcard) => $wildcard ? [
            $this->usuario('Andrea', 'Lizárraga Navarro', 'TAD51711150'),
            $this->usuario('Andrea', 'Luzorrigo Navarro', 'TAD00000001'),
        ] : []);

        $results = app(TadaimaMemberService::class)->search('Andrea Lizarraga Navarro');

        $this->assertSame(['TAD51711150'], array_column($results, 'external_member_id'));
        $this->assertSame('Andrea Lizárraga Navarro', $results[0]['name']);

        // Una consulta tal cual y otra sin acentos, las dos con TODAS las palabras.
        [$exact, $wildcard] = $this->usuariosCalls();
        $this->assertSame(
            '(or(nombre.ilike.*andrea*,apellidos.ilike.*andrea*,email.ilike.*andrea*),'
            . 'or(nombre.ilike.*lizarraga*,apellidos.ilike.*lizarraga*,email.ilike.*lizarraga*),'
            . 'or(nombre.ilike.*navarro*,apellidos.ilike.*navarro*,email.ilike.*navarro*))',
            $exact['and'],
        );
        $this->assertStringContainsString('or(nombre.ilike.*_ndr__*,apellidos.ilike.*_ndr__*,email.ilike.*_ndr__*)', $wildcard['and']);
        $this->assertStringContainsString('apellidos.ilike.*l_z_rr_g_*', $wildcard['and']);
        $this->assertStringContainsString('apellidos.ilike.*n_v_rr_*', $wildcard['and']);
        // Solo usuarios con membresía desde la base.
        $this->assertStringContainsString('socios!inner(*)', $exact['select']);
        // Con varias palabras no se busca por número de socio.
        $this->assertNull(collect($this->calls)->firstWhere('endpoint', 'socios'));
    }

    public function test_single_surname_without_accent_also_finds_accented_one(): void
    {
        $humberto = $this->usuario('Humberto', 'Lizarraga Rincon', 'TAD60097400', false);
        $this->fakeSocios(fn (bool $wildcard) => $wildcard
            ? [$this->usuario('Andrea', 'Lizárraga Navarro', 'TAD51711150'), $humberto]
            : [$humberto]);

        $results = app(TadaimaMemberService::class)->search('Lizarraga');

        // Primero lo exacto; el de acento se agrega sin repetir a Humberto.
        $this->assertSame(['TAD60097400', 'TAD51711150'], array_column($results, 'external_member_id'));
    }

    public function test_common_name_keeps_exact_matches_without_wildcard_query(): void
    {
        // "Andrea" con comodín ("_ndr__") también trae Alejandro, Sandra… Si lo
        // exacto ya llena la lista, no se hace esa segunda consulta.
        $andreas = array_map(fn (int $i) => $this->usuario('Andrea', "Apellido{$i}", "TAD1000000{$i}"), range(0, 9));
        $this->fakeSocios(fn (bool $wildcard) => $wildcard ? [] : $andreas);

        $results = app(TadaimaMemberService::class)->search('Andrea');

        $this->assertCount(10, $results);
        $this->assertCount(1, $this->usuariosCalls());
    }

    public function test_member_number_search_still_works(): void
    {
        $this->fakeSocios(fn () => [], [[
            'id_socio' => 'TAD51711150', 'activo' => true, 'nivel_membresia' => 'b', 'fecha_vencimiento_membresia' => null,
            'usuarios' => ['nombre' => 'Andrea', 'apellidos' => 'Lizárraga Navarro', 'email' => 'andrea@mail.test', 'telefono' => null],
        ]]);

        $results = app(TadaimaMemberService::class)->search('TAD51711150');

        $this->assertSame('TAD51711150', $results[0]['external_member_id']);
        $this->assertSame('ACTIVO', $results[0]['estatus']);
    }

    public function test_users_without_membership_are_skipped(): void
    {
        $this->fakeSocios(fn () => [
            ['id' => 'x', 'nombre' => 'Andrea', 'apellidos' => 'Lizárraga', 'email' => 'a@mail.test', 'telefono' => null, 'socios' => []],
        ]);

        $this->assertSame([], app(TadaimaMemberService::class)->search('Andrea Lizarraga'));
    }
}
