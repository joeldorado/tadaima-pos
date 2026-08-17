<?php

namespace App\Console\Commands;

use App\Support\TomoRule;
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
 *   TOMO (App\Support\TomoRule: categoría Manga/Manga extranjero/kamite/SHONEN
 *   JUMP Y nombre que empieza con "Tomo") → product_type='manga' + details.
 *   El resto de esas categorías (art books, box sets, jap/USA, kamite…) es
 *   producto normal — hasta 2026-08-17 se mapeaba por categoría y metió ~800
 *   no-tomos al módulo Tomos (corregido con tadaima:depurar-tomos).
 * - existencia > 0 → inventory del warehouse Exhibición de la tienda destino
 *   (absoluto) + inventory_movements (entrada al crear, ajuste si había fila).
 *   Existencia 0 NO toca inventario (no borra stock ya operado en Tadaima).
 *
 * Idempotente: upsert por sku — re-correrlo no duplica.
 * El import es masivo (miles de filas por el pooler WAN) → todo va en lotes
 * (insert de chunks + SELECT de ids por sku), nunca fila por fila.
 *
 * Filtros para importar OTRA sucursal sobre un catálogo ya poblado (Centro,
 * 2026-08-17 — mismo .bak Esmeralda, misma extracción, otra tienda destino):
 * - --desde-fecha=YYYY-MM-DD: solo artículos con fecha_alta ≥ esa fecha
 *   (sin fecha quedan fuera). Aplica a TODO, librería incluida.
 * - --solo-con-stock: solo existencia > 0.
 * - --libreria-sin-stock: la librería (= lo que es TOMO según TomoRule: categoría
 *   de manga + nombre "Tomo…") se exenta SOLO del filtro de stock. Comics,
 *   libretas, kamite, art books, etc. NO son librería (Ruben 2026-08-17).
 * - --existentes-solo-stock: los SKUs que ya existen NO se actualizan (nombre,
 *   costo, precio, categoría, tipo intactos; las diferencias de precio solo se
 *   reportan) — únicamente reciben su stock en el warehouse destino.
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
        {--ref= : Referencia de los movimientos (default import-macro-YYYYMMDD de hoy) — distingue cada corrida}
        {--pisar-ceros : Existencia 0 en el origen TAMBIÉN pone en 0 el stock del warehouse destino (re-import donde el origen es la verdad)}
        {--desde-fecha= : Solo artículos con fecha_alta >= YYYY-MM-DD (sin fecha quedan fuera; aplica también a la librería)}
        {--solo-con-stock : Solo artículos con existencia > 0}
        {--libreria-sin-stock : La librería (= tomos: categoría de manga + nombre que empieza con "Tomo") entra aunque tenga existencia 0 — exenta SOLO del filtro de stock}
        {--existentes-solo-stock : Los SKUs que ya existen NO se actualizan (nombre/costo/precio/categoría/tipo); solo reciben su stock en el warehouse destino}
        {--force : Saltar la confirmación interactiva (corridas no-TTY YA autorizadas por Joel)}
        {--unsafe-host : Permitir un target que no sea *.supabase.co (QA/tests)}';

    protected $description = 'Importa el catálogo del POS viejo (Esmeralda S.I, staging JSON) a Supabase — Macro completo o una sucursal filtrada (Centro)';

    /** Máximo de renglones que se listan por bloque de detalle en el reporte. */
    private const MAX_DETALLE = 60;

    /** Tomo / librería = App\Support\TomoRule (categoría de manga + nombre "Tomo…"). */
    private static function esTomo(array $a): bool
    {
        return TomoRule::esTomo($a['name'], $a['categoria']);
    }

    /** "Manga 2233 · Libretas 66 · …" (ya ordenado por quien llama). */
    private function fmtConteos(array $conteos): string
    {
        $partes = [];
        foreach (array_slice($conteos, 0, self::MAX_DETALLE, true) as $k => $n) {
            $partes[] = "{$k} {$n}";
        }

        return implode(' · ', $partes);
    }

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
        $totalStaging = count($arts);

        // ── Filtros de sucursal (Centro) ─────────────────────────────────────
        $desdeFecha = (string) ($this->option('desde-fecha') ?? '');
        if ($desdeFecha !== '') {
            $dt = \DateTimeImmutable::createFromFormat('!Y-m-d', $desdeFecha);
            if (! $dt || $dt->format('Y-m-d') !== $desdeFecha) {
                $this->error("--desde-fecha inválida: \"{$desdeFecha}\" (formato YYYY-MM-DD).");

                return self::FAILURE;
            }
        }
        $soloConStock = (bool) $this->option('solo-con-stock');
        $libreriaSinStock = (bool) $this->option('libreria-sin-stock');
        $existentesSoloStock = (bool) $this->option('existentes-solo-stock');

        $fueraFecha = 0;
        $fueraStock = 0;
        $libreriaRescatada = [];   // categoría → n (librería sin stock que entró por --libreria-sin-stock)
        $catsLibreria = [];        // categoría → n (todo el staging, informativo)
        foreach ($arts as $sku => $a) {
            if (self::esTomo($a)) {
                $catsLibreria[$a['categoria']] = ($catsLibreria[$a['categoria']] ?? 0) + 1;
            }
            if ($desdeFecha !== '' && ($a['fecha_alta'] === null || $a['fecha_alta'] < $desdeFecha)) {
                $fueraFecha++;
                unset($arts[$sku]);

                continue;
            }
            if ($soloConStock && $a['existencia'] <= 0) {
                if ($libreriaSinStock && self::esTomo($a)) {
                    $libreriaRescatada[$a['categoria']] = ($libreriaRescatada[$a['categoria']] ?? 0) + 1;
                } else {
                    $fueraStock++;
                    unset($arts[$sku]);
                }
            }
        }
        if ($arts === []) {
            $this->error('Ningún artículo pasa los filtros — nada que importar.');

            return self::FAILURE;
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
        // Con --existentes-solo-stock, una categoría que solo usan existentes
        // no se crea (no se les toca la categoría).
        $catsNuevas = [];
        foreach ($existentesSoloStock ? $nuevos : $arts as $a) {
            $key = mb_strtolower($a['categoria']);
            if ($a['categoria'] !== '' && ! isset($catsExistentes[$key])) {
                $catsNuevas[$key] = $a['categoria'];
            }
        }

        $esManga = fn (array $a): bool => self::esTomo($a);
        $mangas = array_filter($arts, $esManga);
        $sinCosto = array_filter($arts, fn ($a) => $a['cost'] === null);
        $sinPrecio = array_filter($arts, fn ($a) => $a['price_1'] === null);
        $conStock = array_filter($arts, fn ($a) => $a['existencia'] > 0);

        // ── Resumen (dry-run y previo a confirmar) ───────────────────────────
        $this->info('── Análisis del staging ──');
        $this->line(sprintf('  Artículos en staging: %d (descartados sin nombre/código: %d, duplicados internos: %d)',
            $totalStaging, $sinNombre, $dupInternos));
        if ($desdeFecha !== '' || $soloConStock) {
            $this->line(sprintf('  Filtros → fuera por fecha (< %s): %d · fuera por sin stock: %d · librería sin stock rescatada: %d',
                $desdeFecha !== '' ? $desdeFecha : '—', $fueraFecha, $fueraStock, array_sum($libreriaRescatada)));
            if ($libreriaRescatada !== []) {
                arsort($libreriaRescatada);
                $this->line('    rescatada por categoría: '.$this->fmtConteos($libreriaRescatada));
            }
        }
        if ($libreriaSinStock || $soloConStock) {
            arsort($catsLibreria);
            $this->line(sprintf('  Tomos ("Tomo…" en categoría de manga) en el staging por categoría (%d): %s',
                count($catsLibreria), $catsLibreria !== [] ? $this->fmtConteos($catsLibreria) : '—'));
        }
        $this->line(sprintf('  Artículos que entran: %d', count($arts)));
        $this->line(sprintf('  Nuevos: %d · Ya existen (sku): %d%s', count($nuevos), count($aActualizar),
            $existentesSoloStock ? ' → SOLO stock (sin tocar nombre/costo/precio/categoría)' : ' → se actualizan (diff-aware)'));
        $this->line(sprintf('  Mangas: %d · Sin costo: %d · Sin ningún precio: %d',
            count($mangas), count($sinCosto), count($sinPrecio)));
        $this->line(sprintf('  Con stock: %d (%.0f piezas) → warehouse "%s" (id %d) de "%s"',
            count($conStock), array_sum(array_column($conStock, 'existencia')),
            $warehouse->name, $warehouse->id, $store->name));
        $this->line(sprintf('  Categorías nuevas a crear: %d%s', count($catsNuevas),
            $catsNuevas !== [] ? ' ('.implode(', ', array_slice(array_values($catsNuevas), 0, self::MAX_DETALLE)).')' : ''));

        $this->reportarExistentes($db, $aActualizar, $existentes, $warehouse->id, $existentesSoloStock);

        if ($this->option('dry-run')) {
            $this->info('Dry-run: no se escribió nada.');

            return self::SUCCESS;
        }
        if (! $this->option('force')
            && ! $this->confirm(sprintf('¿Importar %d productos a %s?', count($arts), $host ?: $connName))) {
            return self::FAILURE;
        }

        $chunk = max(50, (int) $this->option('chunk'));
        $now = now();
        $ref = (string) ($this->option('ref') ?: 'import-macro-'.now()->format('Ymd'));
        $pisarCeros = (bool) $this->option('pisar-ceros');
        $notas = sprintf('Importación catálogo %s (Esmeralda S.I)', $store->name);

        // Con --existentes-solo-stock, precios y detalles de manga solo se
        // escriben para los NUEVOS; los existentes solo pasan por el paso 6.
        $paraDatos = $existentesSoloStock ? $nuevos : $arts;

        $db->transaction(function () use (
            $db, $arts, $nuevos, $aActualizar, $catsExistentes, $catsNuevas,
            $esManga, $warehouse, $userId, $chunk, $now, $ref, $pisarCeros,
            $existentesSoloStock, $paraDatos, $notas
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

            // ids de TODO el set (nuevos + existentes) por sku + snapshot para
            // el diff de abajo (evita re-escribir lo que no cambió)
            $ids = [];
            $snapshot = [];
            foreach (array_chunk(array_keys($arts), 1000) as $skus) {
                foreach ($db->table('products')->whereIn('sku', $skus)
                    ->get(['id', 'sku', 'name', 'barcode', 'category_id', 'product_type', 'active', 'cost']) as $p) {
                    $ids[$p->sku] = $p->id;
                    $snapshot[$p->sku] = $p;
                }
            }

            // 3. Updates de los que ya existían — SOLO filas con cambios reales.
            //    En un re-import ~14k skus ya existen pero casi nada cambió;
            //    actualizar todo fila-por-fila sobre el pooler WAN era ~45 min
            //    en UNA transacción y el primer intento murió a medio camino
            //    (rollback limpio). Con diff quedan unos cientos de UPDATEs.
            $updsReales = 0;
            foreach ($existentesSoloStock ? [] : $aActualizar as $a) {
                $prev = $snapshot[$a['sku']] ?? null;
                if ($prev === null) {
                    continue;
                }
                $newCat = $catId($a);
                $newType = $esManga($a) ? 'manga' : 'product';
                $upd = [];
                if ((string) $prev->name !== $a['name']) {
                    $upd['name'] = $a['name'];
                }
                if ((string) ($prev->barcode ?? '') !== $a['sku']) {
                    $upd['barcode'] = $a['sku'];
                }
                if ((int) ($prev->category_id ?? 0) !== (int) ($newCat ?? 0)) {
                    $upd['category_id'] = $newCat;
                }
                if ((string) $prev->product_type !== $newType) {
                    $upd['product_type'] = $newType;
                }
                if ((bool) $prev->active !== $a['active']) {
                    $upd['active'] = $a['active'];
                }
                // nunca pisar costo capturado con NULL
                if ($a['cost'] !== null && round((float) ($prev->cost ?? 0), 2) !== $a['cost']) {
                    $upd['cost'] = $a['cost'];
                }
                if ($upd === []) {
                    continue;
                }
                $upd['updated_at'] = $now;
                $db->table('products')->where('id', $ids[$a['sku']])->update($upd);
                $updsReales++;
            }
            $this->line($existentesSoloStock
                ? sprintf('  Updates de existentes: 0 (--existentes-solo-stock, %d intactos)', count($aActualizar))
                : sprintf('  Updates con cambios reales: %d de %d existentes', $updsReales, count($aActualizar)));

            // 4. Precios — upsert por product_id (price_1/price_2; 3-5 intactos).
            //    Diff-aware: solo se re-escriben los que de verdad cambiaron.
            $conPrecio = array_filter($paraDatos, fn ($a) => $a['price_1'] !== null);
            $preciosPrevios = [];
            foreach (array_chunk(array_values(array_intersect_key($ids, $conPrecio)), 1000) as $lote) {
                foreach ($db->table('product_prices')->whereIn('product_id', $lote)
                    ->get(['product_id', 'price_1', 'price_2']) as $r) {
                    $preciosPrevios[$r->product_id] = $r;
                }
            }
            $inserts = [];
            $preciosCambiados = 0;
            foreach ($conPrecio as $a) {
                $pid = $ids[$a['sku']];
                $prev = $preciosPrevios[$pid] ?? null;
                if ($prev !== null) {
                    $igual1 = round((float) ($prev->price_1 ?? 0), 2) === ($a['price_1'] ?? 0.0);
                    $igual2 = round((float) ($prev->price_2 ?? 0), 2) === ($a['price_2'] ?? 0.0);
                    if ($igual1 && $igual2) {
                        continue;
                    }
                    $db->table('product_prices')->where('product_id', $pid)->update([
                        'price_1' => $a['price_1'], 'price_2' => $a['price_2'], 'updated_at' => $now,
                    ]);
                    $preciosCambiados++;
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
            $this->line(sprintf('  Precios: %d nuevos, %d actualizados', count($inserts), $preciosCambiados));

            // 5. Detalles de manga (fila vacía: volume/editorial/genre no vienen
            //    del origen) — upsert por product_id (PK)
            $mangaIds = array_values(array_intersect_key($ids, array_filter($paraDatos, $esManga)));
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
                        'reference' => $ref,
                        'notes' => $notas,
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
                        'reference' => $ref,
                        'notes' => $notas,
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

            // 6b. --pisar-ceros: en un RE-IMPORT el origen es la verdad — lo que
            //    allá está en 0 se pone en 0 acá también (solo el warehouse
            //    destino; el ajuste con delta negativo deja rastro).
            if ($pisarCeros) {
                $aCero = array_filter($arts, fn ($a) => $a['existencia'] <= 0);
                $movsCero = [];
                foreach (array_chunk(array_values(array_intersect_key($ids, $aCero)), 1000) as $lote) {
                    $filas = $db->table('inventory')->where('warehouse_id', $warehouse->id)
                        ->whereIn('product_id', $lote)->where('quantity', '!=', 0)
                        ->get(['product_id', 'quantity']);
                    foreach ($filas as $r) {
                        $movsCero[] = [
                            'product_id' => $r->product_id, 'warehouse_id' => $warehouse->id,
                            'type' => 'ajuste', 'quantity' => -(float) $r->quantity,
                            'reference' => $ref,
                            'notes' => 'Re-import: existencia 0 en el origen',
                            'user_id' => $userId, 'created_at' => $now,
                        ];
                    }
                    $db->table('inventory')->where('warehouse_id', $warehouse->id)
                        ->whereIn('product_id', $filas->pluck('product_id')->all())
                        ->update(['quantity' => 0, 'updated_at' => $now]);
                }
                foreach (array_chunk($movsCero, $chunk) as $lote) {
                    $db->table('inventory_movements')->insert($lote);
                }
                $this->line(sprintf('  Puestos en 0 (pisar-ceros): %d', count($movsCero)));
            }
        });

        return $this->verify($db, $arts, $warehouse->id, $ref, $pisarCeros);
    }

    /**
     * Reporte previo sobre los SKUs que ya existen en el destino: diferencias
     * de precio (solo informativas cuando --existentes-solo-stock) y filas de
     * inventario del warehouse destino que cambiarían de cantidad.
     */
    private function reportarExistentes($db, array $aActualizar, $existentes, int $warehouseId, bool $soloStock): void
    {
        if ($aActualizar === []) {
            return;
        }
        $idsExist = [];
        foreach ($aActualizar as $a) {
            $idsExist[(int) $existentes[$a['sku']]] = $a;
        }

        if ($soloStock) {
            $difPrecio = [];
            foreach (array_chunk(array_keys($idsExist), 1000) as $lote) {
                foreach ($db->table('product_prices')->whereIn('product_id', $lote)
                    ->get(['product_id', 'price_1', 'price_2']) as $r) {
                    $a = $idsExist[(int) $r->product_id];
                    if ($a['price_1'] !== null && round((float) ($r->price_1 ?? 0), 2) !== $a['price_1']) {
                        $difPrecio[] = sprintf('%s: %.2f→%.2f', $a['sku'], (float) ($r->price_1 ?? 0), $a['price_1']);
                    }
                }
            }
            $this->line(sprintf('  Existentes con precio Normal distinto en el origen (NO se tocan): %d%s',
                count($difPrecio), $difPrecio !== [] ? ' — p.ej. '.implode(' · ', array_slice($difPrecio, 0, 8)) : ''));
        }

        $conStock = array_filter($idsExist, fn ($a) => $a['existencia'] > 0);
        $cambios = [];
        $conservan = 0;
        foreach (array_chunk(array_keys($idsExist), 1000) as $lote) {
            foreach ($db->table('inventory')->where('warehouse_id', $warehouseId)
                ->whereIn('product_id', $lote)->get(['product_id', 'quantity']) as $r) {
                $a = $idsExist[(int) $r->product_id];
                if (isset($conStock[(int) $r->product_id])) {
                    if (abs((float) $r->quantity - $a['existencia']) >= 0.001) {
                        $cambios[] = sprintf('%s: %g→%g', $a['sku'], (float) $r->quantity, $a['existencia']);
                    }
                } elseif ((float) $r->quantity != 0.0) {
                    $conservan++;
                }
            }
        }
        $this->line(sprintf('  Stock previo en el warehouse destino que CAMBIA (absoluto, con ajuste): %d%s',
            count($cambios), $cambios !== [] ? ' — '.implode(' · ', array_slice($cambios, 0, self::MAX_DETALLE)) : ''));
        if ($conservan > 0) {
            $this->line(sprintf('  Existentes con existencia 0 en el origen que CONSERVAN stock en destino: %d (sin --pisar-ceros no se tocan)', $conservan));
        }
    }

    /** Verificación post-import: conteos y sumas contra el staging (solo movimientos de ESTA corrida vía $ref). */
    private function verify($db, array $arts, int $warehouseId, string $ref, bool $pisarCeros): int
    {
        $this->info('── Verificación ──');
        $skus = array_keys($arts);
        $enDb = 0;
        foreach (array_chunk($skus, 1000) as $lote) {
            $enDb += $db->table('products')->whereIn('sku', $lote)->count();
        }
        $okSkus = $enDb === count($arts);
        $this->line(sprintf('  SKUs en destino: %d / %d %s', $enDb, count($arts), $okSkus ? '✓' : '✗'));

        // Staging vs inventario FINAL del warehouse (no vía movimientos: en un
        // re-import los productos sin delta no generan movimiento y la suma
        // por reference daría un ✗ falso). Sin --pisar-ceros el contrato es
        // "existencia 0 no toca inventario" → esos SKUs no entran a la suma.
        $conStock = array_filter($arts, fn ($a) => $a['existencia'] > 0);
        $stockEsperado = round(array_sum(array_column($conStock, 'existencia')), 2);
        $skusStock = $pisarCeros ? $skus : array_keys($conStock);
        $stockReal = 0.0;
        foreach (array_chunk($skusStock, 1000) as $lote) {
            $stockReal += (float) $db->table('inventory')
                ->where('warehouse_id', $warehouseId)
                ->whereIn('product_id', function ($q) use ($lote) {
                    $q->select('id')->from('products')->whereIn('sku', $lote);
                })->sum('quantity');
        }
        $okStock = abs($stockEsperado - $stockReal) < 0.01;
        $this->line(sprintf('  Stock en warehouse vs staging: %.2f / %.2f %s (ref de esta corrida: %s)',
            $stockReal, $stockEsperado, $okStock ? '✓' : '✗', $ref));

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
