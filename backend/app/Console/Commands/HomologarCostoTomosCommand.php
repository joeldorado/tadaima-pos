<?php

declare(strict_types=1);

namespace App\Console\Commands;

use App\Support\TomoCost;
use Illuminate\Console\Command;
use Illuminate\Database\ConnectionInterface;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Homologa el costo de los tomos (Joel 2026-10-03). Ver App\Support\TomoCost.
 *
 * Los tomos llegaron del POS viejo SIN costo (el origen traía 0 y el import lo
 * deja NULL) y un bug del modal de edición dejó algunos con costo = precio. La
 * regla del negocio: costo = precio A (`product_prices.price_1`) × 0.70 para
 * TODO el módulo Tomos (`product_type='manga'`).
 *
 * - Solo escribe `products.cost` (+ `updated_at`) de los tomos que no están en
 *   regla. No toca inventario, precios, productos normales ni ventas.
 * - Escribe por conjuntos (ids agrupados por costo destino): fila por fila
 *   sobre el pooler WAN se cae a media transacción.
 * - Deja en `system_logs` el costo anterior de cada tomo; `--revertir=<id>`
 *   lo restaura exacto, sin pisar los que se editaron después.
 * - Tomo sin precio A se omite (no hay de dónde calcular).
 *
 * Corre LOCAL contra Supabase (mismos guards que tadaima:depurar-tomos).
 * Idempotente: una segunda corrida no encuentra nada. Volver a correrlo
 * después de cada import de .bak (los tomos nuevos entran sin costo).
 */
class HomologarCostoTomosCommand extends Command
{
    protected $signature = 'tadaima:homologar-costo-tomos
        {--dry-run : Solo analizar y reportar, sin escribir nada}
        {--csv= : Ruta donde exportar id, SKU, nombre, precio A, costo antes y después}
        {--revertir= : id del system_log de una corrida previa; restaura el costo anterior}
        {--user=1 : id del usuario que firma el system_log}
        {--connection=pgsql_target : Conexión Laravel destino}
        {--chunk=500 : Filas por lote}
        {--force : Saltar la confirmación interactiva}
        {--unsafe-host : Permitir un target que no sea *.supabase.co (QA/tests)}';

    protected $description = 'Costo de todos los tomos = precio A × 0.70 (margen 30%); con --revertir regresa al costo anterior';

    public const ACTION_HOMOLOGADO = 'products.tomos_costo_homologado';

    public const ACTION_REVERTIDO = 'products.tomos_costo_revertido';

    private const MAX_DETALLE = 40;

    private const TOLERANCIA = 0.005;

    public function handle(): int
    {
        $connName = (string) $this->option('connection');
        $db = DB::connection($connName);

        if (app()->environment('production')) {
            $this->error('Este comando NUNCA corre en producción (es una herramienta local).');

            return self::FAILURE;
        }
        $host = (string) config("database.connections.{$connName}.host");
        if (! str_contains($host, 'supabase.co') && ! $this->option('unsafe-host')) {
            $this->error("El target ({$connName}: {$host}) no es Supabase — usa --unsafe-host si es intencional (QA local).");

            return self::FAILURE;
        }

        return $this->option('revertir') !== null
            ? $this->revertir($db, $host ?: $connName)
            : $this->homologar($db, $host ?: $connName);
    }

    // ── Homologar ────────────────────────────────────────────────────────────

    private function homologar(ConnectionInterface $db, string $destino): int
    {
        $c = $this->clasificar($db);

        $this->info('── Homologación del costo de tomos ──');
        $this->line(sprintf('  Regla: costo = precio A × %s (margen %s%%)',
            number_format(1 - TomoCost::MARGEN_DEFAULT / 100, 2), rtrim(rtrim(number_format(TomoCost::MARGEN_DEFAULT, 2), '0'), '.')));
        $this->line(sprintf('  Tomos: %d · ya en regla: %d · sin precio A (se omiten): %d',
            $c['total'], count($c['ya_ok']), count($c['sin_precio'])));
        $this->line(sprintf('  → A ESCRIBIR: %d (sin costo: %d · costo = precio: %d · otro costo: %d)',
            count($c['a_escribir']), count($c['desde_null']), count($c['desde_igual_precio']), count($c['desde_otro'])));
        $this->detalle('costo = precio', $c['desde_igual_precio'], $c['filas']);
        $this->detalle('otro costo', $c['desde_otro'], $c['filas']);
        $this->detalle('sin precio A', $c['sin_precio'], $c['filas']);

        if (($csv = $this->option('csv')) !== null) {
            $this->exportarCsv((string) $csv, $c['filas']);
        }

        if ($this->option('dry-run')) {
            $this->info('Dry-run: no se escribió nada.');

            return self::SUCCESS;
        }
        if ($c['a_escribir'] === []) {
            $this->info('Nada que homologar: todos los tomos ya están en regla.');

            return self::SUCCESS;
        }
        if (! $this->option('force')
            && ! $this->confirm(sprintf('¿Escribir el costo de %d tomos en %s?', count($c['a_escribir']), $destino))) {
            return self::FAILURE;
        }

        [$logId, $escritos] = $db->transaction(function () use ($db) {
            // Se vuelve a leer DENTRO de la transacción: lo que alguien haya
            // capturado mientras se confirmaba queda como "antes" en el
            // registro (si no, --revertir lo perdería).
            $c = $this->clasificar($db);

            // ids agrupados por costo destino ("111.30" => [ids]).
            $despues = [];
            foreach ($c['a_escribir'] as $id) {
                $despues[$this->fmt($c['filas'][$id]['despues'])][] = $id;
            }
            ksort($despues);
            $antes = ['null' => $c['desde_null'], 'valores' => []];
            foreach (array_merge($c['desde_igual_precio'], $c['desde_otro']) as $id) {
                $antes['valores'][(string) $id] = $this->fmt($c['filas'][$id]['antes']);
            }

            $escritos = 0;
            foreach ($despues as $costo => $ids) {
                $escritos += $this->escribir($db, $ids, (float) $costo);
            }
            if ($escritos !== count($c['a_escribir'])) {
                throw new RuntimeException(sprintf('Se esperaba escribir %d tomos y se escribieron %d — se deshace todo.',
                    count($c['a_escribir']), $escritos));
            }
            // Si alguien cambió un precio A entre la lectura y la escritura,
            // ese tomo quedó fuera de regla: mejor deshacer y volver a correr.
            $pendientes = count($this->clasificar($db)['a_escribir']);
            if ($pendientes !== 0) {
                throw new RuntimeException("Quedaron {$pendientes} tomos fuera de regla después de escribir — se deshace todo; vuelve a correr.");
            }

            $logId = $db->table('system_logs')->insertGetId([
                'user_id' => (int) $this->option('user'),
                'action' => self::ACTION_HOMOLOGADO,
                'entity_type' => 'product',
                'entity_id' => null,
                'description' => sprintf('Costo de tomos homologado a precio A × 0.70: %d escritos (%d sin costo, %d con costo = precio, %d con otro costo), %d ya en regla',
                    $escritos, count($c['desde_null']), count($c['desde_igual_precio']), count($c['desde_otro']), count($c['ya_ok'])),
                'meta' => json_encode([
                    'regla' => 'cost = price_1 × 0.70',
                    'margen' => TomoCost::MARGEN_DEFAULT,
                    'totales' => [
                        'tomos' => $c['total'],
                        'escritos' => $escritos,
                        'ya_ok' => count($c['ya_ok']),
                        'sin_precio' => count($c['sin_precio']),
                        'desde_null' => count($c['desde_null']),
                        'desde_igual_precio' => count($c['desde_igual_precio']),
                        'desde_otro' => count($c['desde_otro']),
                    ],
                    'antes' => $antes,
                    'despues' => $despues,
                ]),
                'created_at' => now(),
            ]);

            return [$logId, $escritos];
        });

        $this->info(sprintf('Homologado: %d tomos escritos. ✓', $escritos));
        $this->line("  Registro en system_logs: #{$logId}");
        $this->line("  Para regresar al costo anterior: php artisan tadaima:homologar-costo-tomos --revertir={$logId}");

        return self::SUCCESS;
    }

    /**
     * Lee todos los tomos con su precio A y los clasifica.
     *
     * @return array{total:int, filas:array<int,array<string,mixed>>, a_escribir:list<int>, ya_ok:list<int>, sin_precio:list<int>, desde_null:list<int>, desde_igual_precio:list<int>, desde_otro:list<int>}
     */
    private function clasificar(ConnectionInterface $db): array
    {
        $rows = $db->table('products')
            ->leftJoin('product_prices as pp', 'pp.product_id', '=', 'products.id')
            ->where('products.product_type', 'manga')
            ->orderBy('products.id')
            ->get(['products.id', 'products.name', 'products.sku', 'products.cost', 'pp.price_1']);

        $out = [
            'total' => $rows->count(), 'filas' => [], 'a_escribir' => [], 'ya_ok' => [],
            'sin_precio' => [], 'desde_null' => [], 'desde_igual_precio' => [], 'desde_otro' => [],
        ];
        foreach ($rows as $r) {
            $id = (int) $r->id;
            $precio = $r->price_1 !== null ? (float) $r->price_1 : null;
            $antes = $r->cost !== null ? (float) $r->cost : null;
            $fila = ['id' => $id, 'sku' => (string) $r->sku, 'name' => (string) $r->name, 'precio' => $precio, 'antes' => $antes, 'despues' => null];

            if ($precio === null || $precio <= 0) {
                $fila['estado'] = 'sin_precio';
                $out['sin_precio'][] = $id;
            } else {
                $fila['despues'] = TomoCost::desdePrecio($precio);
                if ($antes !== null && abs($antes - $fila['despues']) < self::TOLERANCIA) {
                    $fila['estado'] = 'ya_ok';
                    $out['ya_ok'][] = $id;
                } else {
                    $fila['estado'] = match (true) {
                        $antes === null => 'sin_costo',
                        abs($antes - $precio) < self::TOLERANCIA => 'costo_igual_precio',
                        default => 'otro_costo',
                    };
                    $out['a_escribir'][] = $id;
                    $out[match ($fila['estado']) {
                        'sin_costo' => 'desde_null',
                        'costo_igual_precio' => 'desde_igual_precio',
                        default => 'desde_otro',
                    }][] = $id;
                }
            }
            $out['filas'][$id] = $fila;
        }

        return $out;
    }

    // ── Revertir ─────────────────────────────────────────────────────────────

    private function revertir(ConnectionInterface $db, string $destino): int
    {
        $logId = (int) $this->option('revertir');
        $log = $db->table('system_logs')->where('id', $logId)->first();
        if ($log === null || $log->action !== self::ACTION_HOMOLOGADO) {
            $this->error("El system_log #{$logId} no existe o no es de una homologación de costo de tomos.");

            return self::FAILURE;
        }
        $meta = json_decode((string) $log->meta, true);

        // id → costo que dejó la homologación / costo que tenía antes.
        $dejo = [];
        foreach ($meta['despues'] ?? [] as $costo => $ids) {
            foreach ($ids as $id) {
                $dejo[(int) $id] = (float) $costo;
            }
        }
        $tenia = array_fill_keys(array_map('intval', $meta['antes']['null'] ?? []), null);
        foreach ($meta['antes']['valores'] ?? [] as $id => $costo) {
            $tenia[(int) $id] = (float) $costo;
        }

        $actual = [];
        $chunk = max(50, (int) $this->option('chunk'));
        foreach (array_chunk(array_keys($dejo), $chunk) as $lote) {
            foreach ($db->table('products')->whereIn('id', $lote)->where('product_type', 'manga')->get(['id', 'cost']) as $r) {
                $actual[(int) $r->id] = $r->cost !== null ? (float) $r->cost : null;
            }
        }

        // Solo se restaura lo que sigue como lo dejó la homologación.
        $restaurar = [];   // "null" | "169.00" => [ids]
        $omitidos = [];
        foreach ($dejo as $id => $costo) {
            $sigueIgual = array_key_exists($id, $actual) && $actual[$id] !== null && abs($actual[$id] - $costo) < self::TOLERANCIA;
            if (! $sigueIgual || ! array_key_exists($id, $tenia)) {
                $omitidos[] = $id;

                continue;
            }
            $restaurar[$tenia[$id] === null ? 'null' : $this->fmt($tenia[$id])][] = $id;
        }
        $aRestaurar = array_sum(array_map('count', $restaurar));

        $this->info("── Revertir la homologación #{$logId} ──");
        $this->line(sprintf('  Tomos de esa corrida: %d · a restaurar: %d · se omiten (editados o borrados después): %d',
            count($dejo), $aRestaurar, count($omitidos)));
        if ($omitidos !== []) {
            $this->line('  omitidos: '.implode(', ', array_slice($omitidos, 0, self::MAX_DETALLE)).(count($omitidos) > self::MAX_DETALLE ? ' …' : ''));
        }

        if ($this->option('dry-run')) {
            $this->info('Dry-run: no se escribió nada.');

            return self::SUCCESS;
        }
        if ($aRestaurar === 0) {
            $this->info('Nada que revertir.');

            return self::SUCCESS;
        }
        if (! $this->option('force')
            && ! $this->confirm(sprintf('¿Regresar %d tomos a su costo anterior en %s?', $aRestaurar, $destino))) {
            return self::FAILURE;
        }

        $nuevoLog = $db->transaction(function () use ($db, $restaurar, $aRestaurar, $omitidos, $logId) {
            $escritos = 0;
            foreach ($restaurar as $costo => $ids) {
                $escritos += $this->escribir($db, $ids, $costo === 'null' ? null : (float) $costo);
            }
            if ($escritos !== $aRestaurar) {
                throw new RuntimeException("Se esperaba restaurar {$aRestaurar} tomos y se restauraron {$escritos} — se deshace todo.");
            }

            return $db->table('system_logs')->insertGetId([
                'user_id' => (int) $this->option('user'),
                'action' => self::ACTION_REVERTIDO,
                'entity_type' => 'product',
                'entity_id' => null,
                'description' => sprintf('Homologación de costo de tomos #%d revertida: %d restaurados, %d omitidos', $logId, $escritos, count($omitidos)),
                'meta' => json_encode(['log_origen' => $logId, 'restaurados' => $escritos, 'omitidos' => $omitidos]),
                'created_at' => now(),
            ]);
        });

        $this->info(sprintf('Revertido: %d tomos regresaron a su costo anterior. ✓ (system_logs #%d)', $aRestaurar, $nuevoLog));

        return self::SUCCESS;
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    /** UPDATE por lotes de un mismo costo; devuelve las filas afectadas. */
    private function escribir(ConnectionInterface $db, array $ids, ?float $costo): int
    {
        $afectadas = 0;
        $now = now();
        foreach (array_chunk($ids, max(50, (int) $this->option('chunk'))) as $lote) {
            $afectadas += $db->table('products')
                ->whereIn('id', $lote)
                ->where('product_type', 'manga')
                ->update(['cost' => $costo, 'updated_at' => $now]);
        }

        return $afectadas;
    }

    private function fmt(float $monto): string
    {
        return number_format($monto, 2, '.', '');
    }

    /** @param list<int> $ids */
    private function detalle(string $titulo, array $ids, array $filas): void
    {
        if ($ids === []) {
            return;
        }
        $this->line("  {$titulo}:");
        foreach (array_slice($ids, 0, self::MAX_DETALLE) as $id) {
            $f = $filas[$id];
            $this->line(sprintf('    #%d %s · precio A %s · costo %s → %s', $id, $f['name'],
                $f['precio'] !== null ? $this->fmt($f['precio']) : '—',
                $f['antes'] !== null ? $this->fmt($f['antes']) : 'sin costo',
                $f['despues'] !== null ? $this->fmt($f['despues']) : '—'));
        }
        if (count($ids) > self::MAX_DETALLE) {
            $this->line(sprintf('    … y %d más', count($ids) - self::MAX_DETALLE));
        }
    }

    private function exportarCsv(string $ruta, array $filas): void
    {
        $fh = fopen($ruta, 'w');
        if ($fh === false) {
            throw new RuntimeException("No se pudo escribir el CSV en {$ruta}.");
        }
        fputcsv($fh, ['id', 'sku', 'nombre', 'precio_a', 'costo_antes', 'costo_despues', 'estado']);
        foreach ($filas as $f) {
            fputcsv($fh, [
                $f['id'], $f['sku'], $f['name'],
                $f['precio'] !== null ? $this->fmt($f['precio']) : '',
                $f['antes'] !== null ? $this->fmt($f['antes']) : '',
                $f['despues'] !== null ? $this->fmt($f['despues']) : '',
                $f['estado'],
            ]);
        }
        fclose($fh);
        $this->line("  CSV: {$ruta}");
    }
}
