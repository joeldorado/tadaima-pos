<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Importa el catálogo de la sucursal Macro (POS viejo "Esmeralda S.I" sobre
 * SQL Server, backup TADAIMA-20260717.bak) al Tadaima POS (Supabase).
 *
 * Entrada: staging JSON exportado de dbo.articulos con campos
 *   codigo, desc_corta, descripcion, categoria, existencia, costo,
 *   pv1..pv4, baja, marca, departamento, fecha_alta.
 *
 * Mapeo (validado contra ventas reales del origen — DetalleVtas):
 * - codigo → sku Y barcode (mismo patrón que MangaController).
 * - pv4 (lo que se cobra) → price_1 Normal · pv3 (~10% abajo) → price_2 Socio.
 *   pv1/pv2 son niveles legacy 2022-2024 y se ignoran.
 * - costo ≤ 0 → cost NULL ("sin costo": lo cura MissingCostModal después).
 *   En UPDATE el costo solo se sobreescribe si el origen trae > 0 — los costos
 *   ya capturados a mano en Tadaima no se pisan con NULL.
 * - categoría → product_categories por nombre (crea faltantes);
 *   Manga/Manga extranjero/kamite/SHONEN JUMP → product_type='manga' + details.
 * - existencia > 0 → inventory del warehouse Exhibición de la tienda destino
 *   (absoluto) + inventory_movements (entrada al crear, ajuste si había fila).
 *   Existencia 0 NO toca inventario (no borra stock ya operado en Tadaima).
 *
 * Idempotente: upsert por sku — re-correrlo no duplica.
 * El import es masivo (miles de filas por el pooler WAN) → todo va en lotes
 * (insert de chunks + SELECT de ids por sku), nunca fila por fila.
 */
class ImportMacroProductsCommand extends Command
{
    protected $signature = 'tadaima:import-macro
        {file : Ruta del staging JSON (export de dbo.articulos)}
        {--dry-run : Solo analizar y reportar, sin escribir nada}
        {--store=Tadaima MACRO : Nombre de la tienda destino del stock}
        {--user=1 : id del usuario que firma los movimientos de inventario}
        {--connection=pgsql_target : Conexión Laravel destino}
        {--chunk=500 : Filas por lote de INSERT}
        {--unsafe-host : Permitir un target que no sea *.supabase.co (QA/tests)}';

    protected $description = 'Importa el catálogo del POS viejo de la sucursal Macro (staging JSON) a Supabase';

    private const MANGA_CATEGORIES = ['manga', 'manga extranjero', 'kamite', 'shonen jump'];

    private const IMPORT_REF = 'import-macro-20260717';

    public function handle(): int
    {
        $connName = (string) $this->option('connection');
        $db = DB::connection($connName);

        // ── Guards ───────────────────────────────────────────────────────────
        if (app()->environment('production')) {
            $this->error('Este comando NUNCA corre en producción (es una herramienta local).');

            return self::FAILURE;
        }
        $host = (string) config("database.connections.{$connName}.host");
        if (! str_contains($host, 'supabase.co') && ! $this->option('unsafe-host')) {
            $this->error("El target ({$connName}: {$host}) no es Supabase — usa --unsafe-host si es intencional (QA local).");

            return self::FAILURE;
        }

        $file = (string) $this->argument('file');
        if (! is_readable($file)) {
            $this->error("No puedo leer el staging: {$file}");

            return self::FAILURE;
        }
        $raw = json_decode((string) file_get_contents($file), true);
        if (! is_array($raw) || $raw === []) {
            $this->error('El staging JSON está vacío o no es un array.');

            return self::FAILURE;
        }

        // ── Normalización + dedup interno (último codigo gana) ───────────────
        $arts = [];
        $dupInternos = 0;
        $sinNombre = 0;
        foreach ($raw as $a) {
            $codigo = trim((string) ($a['codigo'] ?? ''));
            $nombre = trim((string) ($a['descripcion'] ?? '')) !== ''
                ? trim((string) $a['descripcion'])
                : trim((string) ($a['desc_corta'] ?? ''));
            if ($codigo === '' || $nombre === '') {
                $sinNombre++;

                continue;
            }
            if (isset($arts[$codigo])) {
                $dupInternos++;
            }
            $arts[$codigo] = [
                'sku' => $codigo,
                'name' => mb_substr($nombre, 0, 255),
                'categoria' => trim((string) ($a['categoria'] ?? '')),
                'existencia' => max(0.0, (float) ($a['existencia'] ?? 0)),
                'cost' => ((float) ($a['costo'] ?? 0)) > 0 ? round((float) $a['costo'], 2) : null,
                'price_1' => ((float) ($a['pv4'] ?? 0)) > 0 ? round((float) $a['pv4'], 2)
                    : (((float) ($a['pv3'] ?? 0)) > 0 ? round((float) $a['pv3'], 2) : null),
                'price_2' => ((float) ($a['pv3'] ?? 0)) > 0 && ((float) ($a['pv4'] ?? 0)) > 0
                    ? round((float) $a['pv3'], 2) : null,
                'active' => ! (bool) ($a['baja'] ?? false),
                'fecha_alta' => (string) ($a['fecha_alta'] ?? '') ?: null,
            ];
        }

        // ── Contexto del destino ─────────────────────────────────────────────
        $storeName = (string) $this->option('store');
        $store = $db->table('stores')->whereRaw('LOWER(name) = ?', [mb_strtolower($storeName)])->first();
        if (! $store) {
            $this->error("No existe la tienda destino \"{$storeName}\" en el target.");

            return self::FAILURE;
        }
        $warehouse = $db->table('warehouses')
            ->where('store_id', $store->id)->where('type', 'store')->where('active', true)
            ->orderBy('id')->first();
        if (! $warehouse) {
            $this->error("La tienda \"{$storeName}\" no tiene warehouse type='store' (Exhibición).");

            return self::FAILURE;
        }
        $userId = (int) $this->option('user');
        if (! $db->table('users')->where('id', $userId)->exists()) {
            $this->error("No existe el usuario id {$userId} en el target (firma de movimientos).");

            return self::FAILURE;
        }

        $existentes = $db->table('products')->pluck('id', 'sku');
        $nuevos = array_filter($arts, fn ($a) => ! isset($existentes[$a['sku']]));
        $aActualizar = array_filter($arts, fn ($a) => isset($existentes[$a['sku']]));

        $catsExistentes = [];
        foreach ($db->table('product_categories')->get(['id', 'name']) as $c) {
            $catsExistentes[mb_strtolower(trim($c->name))] = $c->id;
        }
        $catsNuevas = [];
        foreach ($arts as $a) {
            $key = mb_strtolower($a['categoria']);
            if ($a['categoria'] !== '' && ! isset($catsExistentes[$key])) {
                $catsNuevas[$key] = $a['categoria'];
            }
        }

        $esManga = fn (array $a): bool => in_array(mb_strtolower($a['categoria']), self::MANGA_CATEGORIES, true);
        $mangas = array_filter($arts, $esManga);
        $sinCosto = array_filter($arts, fn ($a) => $a['cost'] === null);
        $sinPrecio = array_filter($arts, fn ($a) => $a['price_1'] === null);
        $conStock = array_filter($arts, fn ($a) => $a['existencia'] > 0);

        // ── Resumen (dry-run y previo a confirmar) ───────────────────────────
        $this->info('── Análisis del staging ──');
        $this->line(sprintf('  Artículos válidos: %d (descartados sin nombre/código: %d, duplicados internos: %d)',
            count($arts), $sinNombre, $dupInternos));
        $this->line(sprintf('  Nuevos: %d · A actualizar (sku ya existe): %d', count($nuevos), count($aActualizar)));
        $this->line(sprintf('  Mangas: %d · Sin costo: %d · Sin ningún precio: %d',
            count($mangas), count($sinCosto), count($sinPrecio)));
        $this->line(sprintf('  Con stock: %d (%.0f piezas) → warehouse "%s" (id %d) de "%s"',
            count($conStock), array_sum(array_column($conStock, 'existencia')),
            $warehouse->name, $warehouse->id, $store->name));
        $this->line(sprintf('  Categorías nuevas a crear: %d', count($catsNuevas)));

        if ($this->option('dry-run')) {
            $this->info('Dry-run: no se escribió nada.');

            return self::SUCCESS;
        }
        if (! $this->confirm(sprintf('¿Importar %d productos a %s?', count($arts), $host ?: $connName))) {
            return self::FAILURE;
        }

        $chunk = max(50, (int) $this->option('chunk'));
        $now = now();

        $db->transaction(function () use (
            $db, $arts, $nuevos, $aActualizar, $catsExistentes, $catsNuevas,
            $esManga, $warehouse, $userId, $chunk, $now
        ) {
            // 1. Categorías faltantes
            foreach ($catsNuevas as $key => $nombre) {
                $catsExistentes[$key] = $db->table('product_categories')->insertGetId([
                    'name' => $nombre, 'active' => true,
                    'created_at' => $now, 'updated_at' => $now,
                ]);
            }
            $catId = fn (array $a) => $a['categoria'] !== ''
                ? ($catsExistentes[mb_strtolower($a['categoria'])] ?? null) : null;

            // 2. Products nuevos (lotes) — created_at conserva la fecha de alta
            //    del sistema viejo (procedencia real del catálogo)
            foreach (array_chunk(array_values($nuevos), $chunk) as $lote) {
                $filas = [];
                foreach ($lote as $a) {
                    $filas[] = [
                        'name' => $a['name'],
                        'sku' => $a['sku'],
                        'barcode' => $a['sku'],
                        'category_id' => $catId($a),
                        'cost' => $a['cost'],
                        'active' => $a['active'],
                        'product_type' => $esManga($a) ? 'manga' : 'product',
                        'created_at' => $a['fecha_alta'] ?? $now,
                        'updated_at' => $now,
                    ];
                }
                $db->table('products')->insert($filas);
            }

            // ids de TODO el set (nuevos + existentes) por sku
            $ids = [];
            foreach (array_chunk(array_keys($arts), 1000) as $skus) {
                foreach ($db->table('products')->whereIn('sku', $skus)->get(['id', 'sku']) as $p) {
                    $ids[$p->sku] = $p->id;
                }
            }

            // 3. Updates de los que ya existían (pocos — fila por fila está bien)
            foreach ($aActualizar as $a) {
                $upd = [
                    'name' => $a['name'],
                    'barcode' => $a['sku'],
                    'category_id' => $catId($a),
                    'product_type' => $esManga($a) ? 'manga' : 'product',
                    'active' => $a['active'],
                    'updated_at' => $now,
                ];
                if ($a['cost'] !== null) {
                    $upd['cost'] = $a['cost'];   // nunca pisar costo capturado con NULL
                }
                $db->table('products')->where('id', $ids[$a['sku']])->update($upd);
            }

            // 4. Precios — upsert por product_id (price_1/price_2; 3-5 intactos)
            $conPrecio = array_filter($arts, fn ($a) => $a['price_1'] !== null);
            $yaTienenPrecio = [];
            foreach (array_chunk(array_values(array_intersect_key($ids, $conPrecio)), 1000) as $lote) {
                foreach ($db->table('product_prices')->whereIn('product_id', $lote)->get(['product_id']) as $r) {
                    $yaTienenPrecio[$r->product_id] = true;
                }
            }
            $inserts = [];
            foreach ($conPrecio as $a) {
                $pid = $ids[$a['sku']];
                if (isset($yaTienenPrecio[$pid])) {
                    $db->table('product_prices')->where('product_id', $pid)->update([
                        'price_1' => $a['price_1'], 'price_2' => $a['price_2'], 'updated_at' => $now,
                    ]);
                } else {
                    $inserts[] = [
                        'product_id' => $pid, 'price_1' => $a['price_1'], 'price_2' => $a['price_2'],
                        'created_at' => $now, 'updated_at' => $now,
                    ];
                }
            }
            foreach (array_chunk($inserts, $chunk) as $lote) {
                $db->table('product_prices')->insert($lote);
            }

            // 5. Detalles de manga (fila vacía: volume/editorial/genre no vienen
            //    del origen) — upsert por product_id (PK)
            $mangaIds = array_values(array_intersect_key($ids, array_filter($arts, $esManga)));
            $yaConDetalle = [];
            foreach (array_chunk($mangaIds, 1000) as $lote) {
                foreach ($db->table('product_manga_details')->whereIn('product_id', $lote)->get(['product_id']) as $r) {
                    $yaConDetalle[$r->product_id] = true;
                }
            }
            $faltantes = array_values(array_filter($mangaIds, fn ($id) => ! isset($yaConDetalle[$id])));
            foreach (array_chunk($faltantes, $chunk) as $lote) {
                $db->table('product_manga_details')->insert(array_map(
                    fn ($id) => ['product_id' => $id, 'created_at' => $now, 'updated_at' => $now],
                    $lote
                ));
            }

            // 6. Stock → inventory (absoluto) + movimiento con firma.
            //    Solo existencia > 0: el origen en 0 no borra stock ya operado.
            $conStock = array_filter($arts, fn ($a) => $a['existencia'] > 0);
            $invPrevio = [];
            foreach (array_chunk(array_values(array_intersect_key($ids, $conStock)), 1000) as $lote) {
                foreach ($db->table('inventory')->where('warehouse_id', $warehouse->id)
                    ->whereIn('product_id', $lote)->get(['product_id', 'quantity']) as $r) {
                    $invPrevio[$r->product_id] = (float) $r->quantity;
                }
            }
            $invInserts = [];
            $movs = [];
            foreach ($conStock as $a) {
                $pid = $ids[$a['sku']];
                $qty = $a['existencia'];
                if (isset($invPrevio[$pid])) {
                    $delta = $qty - $invPrevio[$pid];
                    if (abs($delta) < 0.001) {
                        continue;
                    }
                    $db->table('inventory')->where('product_id', $pid)
                        ->where('warehouse_id', $warehouse->id)
                        ->update(['quantity' => $qty, 'updated_at' => $now]);
                    $movs[] = [
                        'product_id' => $pid, 'warehouse_id' => $warehouse->id,
                        'type' => 'ajuste', 'quantity' => $delta,
                        'reference' => self::IMPORT_REF,
                        'notes' => 'Importación catálogo Macro (Esmeralda S.I)',
                        'user_id' => $userId, 'created_at' => $now,
                    ];
                } else {
                    $invInserts[] = [
                        'product_id' => $pid, 'warehouse_id' => $warehouse->id,
                        'quantity' => $qty, 'created_at' => $now, 'updated_at' => $now,
                    ];
                    $movs[] = [
                        'product_id' => $pid, 'warehouse_id' => $warehouse->id,
                        'type' => 'entrada', 'quantity' => $qty,
                        'reference' => self::IMPORT_REF,
                        'notes' => 'Importación catálogo Macro (Esmeralda S.I)',
                        'user_id' => $userId, 'created_at' => $now,
                    ];
                }
            }
            foreach (array_chunk($invInserts, $chunk) as $lote) {
                $db->table('inventory')->insert($lote);
            }
            foreach (array_chunk($movs, $chunk) as $lote) {
                $db->table('inventory_movements')->insert($lote);
            }
        });

        return $this->verify($db, $arts, $warehouse->id);
    }

    /** Verificación post-import: conteos y sumas contra el staging. */
    private function verify($db, array $arts, int $warehouseId): int
    {
        $this->info('── Verificación ──');
        $skus = array_keys($arts);
        $enDb = 0;
        foreach (array_chunk($skus, 1000) as $lote) {
            $enDb += $db->table('products')->whereIn('sku', $lote)->count();
        }
        $okSkus = $enDb === count($arts);
        $this->line(sprintf('  SKUs en destino: %d / %d %s', $enDb, count($arts), $okSkus ? '✓' : '✗'));

        $stockEsperado = round(array_sum(array_map(
            fn ($a) => $a['existencia'] > 0 ? $a['existencia'] : 0, $arts
        )), 2);
        $stockReal = (float) $db->table('inventory')->where('warehouse_id', $warehouseId)
            ->whereIn('product_id', function ($q) use ($warehouseId) {
                $q->select('product_id')->from('inventory_movements')
                    ->where('warehouse_id', $warehouseId)->where('reference', self::IMPORT_REF);
            })->sum('quantity');
        $okStock = abs($stockEsperado - $stockReal) < 0.01;
        $this->line(sprintf('  Stock importado: %.2f / %.2f %s', $stockReal, $stockEsperado, $okStock ? '✓' : '✗'));

        $muestra = array_slice($arts, 0, 5, true);
        foreach ($muestra as $a) {
            $p = $db->table('products')
                ->leftJoin('product_prices', 'products.id', '=', 'product_prices.product_id')
                ->where('products.sku', $a['sku'])
                ->first(['products.name', 'products.cost', 'product_prices.price_1']);
            $this->line(sprintf('  spot %s → %s | costo %s | precio %s',
                $a['sku'], $p?->name ?? 'FALTA ✗', $p->cost ?? '—', $p->price_1 ?? '—'));
        }

        if ($okSkus && $okStock) {
            $this->info('Importación verificada. ✓');

            return self::SUCCESS;
        }
        $this->error('La verificación NO cuadró — revisar antes de re-correr.');

        return self::FAILURE;
    }
}
