<?php

namespace App\Console\Commands;

use App\Support\TomoRule;
use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Depurado del módulo Tomos (Ruben/Joel 2026-08-17). Ver App\Support\TomoRule.
 *
 * La migración de Macro mapeó por CATEGORÍA (Manga / Manga extranjero /
 * kamite / SHONEN JUMP → product_type='manga') y metió al módulo Tomos ~800
 * artículos que NO son tomos (art books, box sets, ediciones jap/USA, kamite,
 * revistas). La regla real es por NOMBRE: tomo = empieza con "Tomo".
 *
 * Universo revisado: product_type='manga' + categorías "librería"
 * (manga/comic/libro/libret/librer/shonen/kamite). Para cada artículo:
 *  - nombre empieza con "Tomo"           → se queda como está (manga sigue
 *    manga; los Comics "Tomo…" siguen Comics — decisión Joel).
 *  - no-tomo CON stock (cualquier bodega) → product_type='product', conserva
 *    categoría (sale de Tomos, sigue vendible en Caja).
 *  - no-tomo SIN stock                     → se BORRA; si tiene historial
 *    (ventas/preventas/apartados) se DESACTIVA + product_type='product'
 *    (products no tiene soft-delete; mismo criterio que la purga).
 * product_promotions.product_id se pone NULL antes de borrar (FK CASCADE
 * mataría promos multi-producto). Los product_manga_details de los
 * reclasificados se dejan (todo el módulo Tomos filtra por product_type;
 * borrarlos perdería volumen/editorial capturados y no es reversible).
 *
 * Corre LOCAL contra Supabase (mismos guards que tadaima:import-macro).
 * Idempotente: una segunda corrida no encuentra nada.
 */
class DepurarTomosCommand extends Command
{
    protected $signature = 'tadaima:depurar-tomos
        {--dry-run : Solo analizar y reportar, sin escribir nada}
        {--user=1 : id del usuario que firma el system_log}
        {--connection=pgsql_target : Conexión Laravel destino}
        {--chunk=500 : Filas por lote}
        {--force : Saltar la confirmación interactiva}
        {--unsafe-host : Permitir un target que no sea *.supabase.co (QA/tests)}';

    protected $description = 'Módulo Tomos = solo nombres que empiezan con "Tomo"; el resto de librería con stock → producto, sin stock → se borra';

    private const MAX_DETALLE = 40;

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

        // ── Universo: mangas + categorías librería ───────────────────────────
        $catsLibreria = [];
        foreach ($db->table('product_categories')->get(['id', 'name']) as $c) {
            if (TomoRule::esCategoriaLibreria((string) $c->name)) {
                $catsLibreria[(int) $c->id] = (string) $c->name;
            }
        }
        $stockSql = 'COALESCE((SELECT SUM(i.quantity) FROM inventory i WHERE i.product_id = products.id), 0)';
        $universo = $db->table('products')
            ->where(function ($q) use ($catsLibreria) {
                $q->where('product_type', 'manga');
                if ($catsLibreria !== []) {
                    $q->orWhereIn('category_id', array_keys($catsLibreria));
                }
            })
            ->selectRaw("id, name, product_type, category_id, active, {$stockSql} as stock")
            ->get();

        // ── Historial (solo de los que podrían borrarse) ─────────────────────
        $conHistorial = [];
        $candidatosBorrar = $universo->filter(fn ($p) => ! TomoRule::esNombreTomo((string) $p->name) && (float) $p->stock <= 0)
            ->pluck('id')->all();
        foreach (array_chunk($candidatosBorrar, 1000) as $lote) {
            foreach (['sale_items', 'pre_sale_order_items', 'layaways'] as $tabla) {
                foreach ($db->table($tabla)->whereIn('product_id', $lote)->distinct()->pluck('product_id') as $pid) {
                    $conHistorial[(int) $pid] = true;
                }
            }
        }

        // ── Clasificación ────────────────────────────────────────────────────
        $quedan = [];        // tomos (manga) + Comics "Tomo…" + no-tomo con stock que ya era product
        $aProducto = [];     // manga no-tomo con stock → product
        $aBorrar = [];       // no-tomo sin stock sin historial
        $aDesactivar = [];   // no-tomo sin stock con historial (→ inactivo + product)
        $porCat = [];        // reporte: cat → destino → n
        $catNombre = fn ($p) => $catsLibreria[(int) ($p->category_id ?? 0)] ?? '(sin categoría)';
        foreach ($universo as $p) {
            $cat = $catNombre($p);
            if (TomoRule::esNombreTomo((string) $p->name)) {
                $quedan[] = (int) $p->id;
                $porCat[$cat]['Tomo* (se queda)'] = ($porCat[$cat]['Tomo* (se queda)'] ?? 0) + 1;

                continue;
            }
            if ((float) $p->stock > 0) {
                if ($p->product_type === 'manga') {
                    $aProducto[] = (int) $p->id;
                    $porCat[$cat]['no-tomo CON stock → producto'] = ($porCat[$cat]['no-tomo CON stock → producto'] ?? 0) + 1;
                } else {
                    $quedan[] = (int) $p->id;
                    $porCat[$cat]['no-tomo CON stock (ya producto)'] = ($porCat[$cat]['no-tomo CON stock (ya producto)'] ?? 0) + 1;
                }

                continue;
            }
            if (isset($conHistorial[(int) $p->id])) {
                $aDesactivar[] = (int) $p->id;
                $porCat[$cat]['no-tomo SIN stock con historial → desactivar'] = ($porCat[$cat]['no-tomo SIN stock con historial → desactivar'] ?? 0) + 1;
            } else {
                $aBorrar[] = (int) $p->id;
                $porCat[$cat]['no-tomo SIN stock → BORRAR'] = ($porCat[$cat]['no-tomo SIN stock → BORRAR'] ?? 0) + 1;
            }
        }

        $totalProductos = $db->table('products')->count();
        $mangasAntes = $db->table('products')->where('product_type', 'manga')->count();

        // ── Resumen ──────────────────────────────────────────────────────────
        $this->info('── Análisis del depurado de Tomos ──');
        $this->line(sprintf('  Productos totales: %d · en módulo Tomos (manga): %d · universo librería revisado: %d',
            $totalProductos, $mangasAntes, $universo->count()));
        ksort($porCat);
        foreach ($porCat as $cat => $destinos) {
            arsort($destinos);
            $partes = [];
            foreach ($destinos as $d => $n) {
                $partes[] = "{$d}: {$n}";
            }
            $this->line(sprintf('  %-22s %s', $cat, implode(' · ', $partes)));
        }
        $this->line(sprintf('  → Se quedan: %d · A PRODUCTO (con stock): %d · A BORRAR: %d · A DESACTIVAR (historial): %d',
            count($quedan), count($aProducto), count($aBorrar), count($aDesactivar)));
        $tomosDespues = $universo->filter(fn ($p) => $p->product_type === 'manga' && TomoRule::esNombreTomo((string) $p->name))->count();
        $this->line(sprintf('  Tomos después: %d (de %d) · productos después: %d',
            $tomosDespues, $mangasAntes, $totalProductos - count($aBorrar)));
        if ($aProducto !== []) {
            $muestra = $universo->whereIn('id', array_slice($aProducto, 0, self::MAX_DETALLE))->pluck('name')->all();
            $this->line('  muestra a producto: '.implode(' · ', array_slice($muestra, 0, 8)));
        }
        if ($aBorrar !== []) {
            $muestra = $universo->whereIn('id', array_slice($aBorrar, 0, self::MAX_DETALLE))->pluck('name')->all();
            $this->line('  muestra a borrar: '.implode(' · ', array_slice($muestra, 0, 8)));
        }

        if ($this->option('dry-run')) {
            $this->info('Dry-run: no se escribió nada.');

            return self::SUCCESS;
        }
        if ($aProducto === [] && $aBorrar === [] && $aDesactivar === []) {
            $this->info('Nada que depurar: el módulo Tomos ya solo tiene tomos.');

            return self::SUCCESS;
        }
        if (! $this->option('force')
            && ! $this->confirm(sprintf('¿Pasar %d a producto, borrar %d y desactivar %d en %s?',
                count($aProducto), count($aBorrar), count($aDesactivar), $host ?: $connName))) {
            return self::FAILURE;
        }

        $chunk = max(50, (int) $this->option('chunk'));
        $now = now();
        $userId = (int) $this->option('user');

        $db->transaction(function () use ($db, $aProducto, $aBorrar, $aDesactivar, $chunk, $now, $userId) {
            foreach (array_chunk($aProducto, $chunk) as $lote) {
                $db->table('products')->whereIn('id', $lote)
                    ->update(['product_type' => 'product', 'updated_at' => $now]);
            }
            foreach (array_chunk($aDesactivar, $chunk) as $lote) {
                $db->table('products')->whereIn('id', $lote)
                    ->update(['product_type' => 'product', 'active' => false, 'updated_at' => $now]);
            }
            foreach (array_chunk($aBorrar, $chunk) as $lote) {
                $db->table('product_promotions')->whereIn('product_id', $lote)
                    ->update(['product_id' => null]);
                $db->table('products')->whereIn('id', $lote)->delete();
            }
            $db->table('system_logs')->insert([
                'user_id' => $userId,
                'action' => 'products.tomos_depurados',
                'entity_type' => 'product',
                'entity_id' => null,
                'description' => sprintf('Depurado Tomos: %d a producto, %d borrados, %d desactivados (regla: tomo = nombre empieza con "Tomo")',
                    count($aProducto), count($aBorrar), count($aDesactivar)),
                'meta' => json_encode([
                    'to_product' => count($aProducto), 'deleted' => count($aBorrar), 'deactivated' => count($aDesactivar),
                    'to_product_ids' => $aProducto, 'deactivated_ids' => $aDesactivar,
                ]),
                'created_at' => $now,
            ]);
        });

        // ── Verificación ─────────────────────────────────────────────────────
        $this->info('── Verificación ──');
        $mangasNoTomo = $db->table('products')->where('product_type', 'manga')
            ->whereRaw("LOWER(TRIM(name)) NOT LIKE 'tomo%'")->count();
        $borrarRestantes = $aBorrar !== []
            ? $db->table('products')->whereIn('id', array_slice($aBorrar, 0, 1000))->count()
            : 0;
        $mangasDespues = $db->table('products')->where('product_type', 'manga')->count();
        $this->line(sprintf('  Productos: %d → %d · Tomos: %d → %d', $totalProductos, $db->table('products')->count(), $mangasAntes, $mangasDespues));
        $this->line(sprintf('  Mangas que NO empiezan con Tomo: %d %s', $mangasNoTomo, $mangasNoTomo === 0 ? '✓' : '✗'));
        $this->line(sprintf('  Muestra de borrados aún presentes: %d %s', $borrarRestantes, $borrarRestantes === 0 ? '✓' : '✗'));

        if ($mangasNoTomo === 0 && $borrarRestantes === 0) {
            $this->info('Depurado verificado. ✓');

            return self::SUCCESS;
        }
        $this->error('La verificación NO cuadró — revisar.');

        return self::FAILURE;
    }
}
