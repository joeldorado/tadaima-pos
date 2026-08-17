<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;

/**
 * Purga del catálogo importado de Macro (pedido Joel 2026-08-06): borra los
 * productos SIN stock, conservando los TOMOS (product_type='manga'). Hasta
 * 2026-08-17 también protegía categorías comics/libretas/kamite ("todo lo que
 * se considere libros"); Ruben/Joel acotaron: librería = solo tomos (nombre
 * "Tomo…"). Corre LOCAL contra Supabase, igual que tadaima:import-macro.
 *
 * Reglas:
 * - PROTEGIDOS (nunca se tocan): product_type='manga' (= tomos); categorías de
 *   PROTECTED_CATEGORY_PATTERNS (hoy vacía, ver arriba); y cualquier
 *   producto con stock global > 0 (suma de TODOS los warehouses).
 * - Candidatos con ventas/preventas/apartados → se DESACTIVAN (active=false),
 *   no se borran: products no tiene soft-delete y borrar dejaría el histórico
 *   de ventas sin nombre (sale_items.product_id es SET NULL) o tronaría por
 *   el RESTRICT de layaways.
 * - El resto → DELETE físico en lotes. Antes del DELETE se hace
 *   product_promotions.product_id = NULL (su FK es CASCADE y borraría la
 *   promo completa aunque esté asignada a otros productos). Los hijos
 *   restantes (prices, images, inventory, catalog_products…) caen por CASCADE.
 */
class PurgeNoStockProductsCommand extends Command
{
    protected $signature = 'tadaima:purge-no-stock
        {--dry-run : Solo analizar y reportar, sin escribir nada}
        {--connection=pgsql_target : Conexión Laravel destino}
        {--user=1 : id del usuario que firma el system_log}
        {--chunk=500 : IDs por lote de UPDATE/DELETE}
        {--force : Saltar la confirmación interactiva (corridas no-TTY YA autorizadas por Joel)}
        {--unsafe-host : Permitir un target que no sea *.supabase.co (QA/tests)}';

    protected $description = 'Borra productos sin stock (excepto mangas/comics/libros y los que tienen historial, que solo se desactivan)';

    /**
     * Desde 2026-08-17 (Ruben/Joel) "librería" = solo TOMOS (product_type='manga'
     * = nombre que empieza con "Tomo", ver App\Support\TomoRule). Ya NO se
     * protegen categorías por nombre (comics/libretas/kamite sin stock se
     * purgan como cualquier producto). Constante vacía a propósito — la
     * mecánica queda por si el equipo vuelve a pedir una categoría protegida.
     */
    public const PROTECTED_CATEGORY_PATTERNS = [];

    public function handle(): int
    {
        $connName = (string) $this->option('connection');
        $db = DB::connection($connName);

        // ── Guards (mismo patrón que tadaima:import-macro) ───────────────────
        if (app()->environment('production')) {
            $this->error('Este comando NUNCA corre en producción (es una herramienta local).');

            return self::FAILURE;
        }
        $host = (string) config("database.connections.{$connName}.host");
        if (! str_contains($host, 'supabase.co') && ! $this->option('unsafe-host')) {
            $this->error("El target ({$connName}: {$host}) no es Supabase — usa --unsafe-host si es intencional (QA local).");

            return self::FAILURE;
        }

        // ── Categorías protegidas ────────────────────────────────────────────
        $catsProtegidas = [];
        foreach ($db->table('product_categories')->get(['id', 'name']) as $c) {
            $nombre = mb_strtolower(trim((string) $c->name));
            foreach (self::PROTECTED_CATEGORY_PATTERNS as $pat) {
                if (str_contains($nombre, $pat)) {
                    $catsProtegidas[$c->id] = $c->name;
                    break;
                }
            }
        }

        // ── Candidatos: sin stock global, no manga, categoría no protegida ───
        $stockSql = 'COALESCE((SELECT SUM(i.quantity) FROM inventory i WHERE i.product_id = products.id), 0)';
        $query = $db->table('products')
            ->where('product_type', '!=', 'manga')
            ->whereRaw("{$stockSql} <= 0");
        if ($catsProtegidas !== []) {
            $query->where(function ($q) use ($catsProtegidas) {
                $q->whereNull('category_id')->orWhereNotIn('category_id', array_keys($catsProtegidas));
            });
        }
        $candidatos = $query->pluck('id')->all();

        // ── Con historial → desactivar, no borrar ────────────────────────────
        $conHistorial = [];
        foreach (array_chunk($candidatos, 1000) as $lote) {
            foreach (['sale_items', 'pre_sale_order_items', 'layaways'] as $tabla) {
                foreach ($db->table($tabla)->whereIn('product_id', $lote)
                    ->distinct()->pluck('product_id') as $pid) {
                    $conHistorial[$pid] = true;
                }
            }
        }
        $aDesactivar = array_values(array_filter($candidatos, fn ($id) => isset($conHistorial[$id])));
        $aBorrar = array_values(array_filter($candidatos, fn ($id) => ! isset($conHistorial[$id])));

        $totalProductos = $db->table('products')->count();
        $totalMangas = $db->table('products')->where('product_type', 'manga')->count();

        // ── Resumen ──────────────────────────────────────────────────────────
        $this->info('── Análisis de la purga ──');
        $this->line(sprintf('  Productos totales: %d (mangas protegidos: %d)', $totalProductos, $totalMangas));
        $this->line(sprintf('  Categorías protegidas (%d): %s', count($catsProtegidas),
            implode(', ', array_slice(array_values($catsProtegidas), 0, 10))));
        $this->line(sprintf('  Candidatos sin stock (no librería): %d', count($candidatos)));
        $this->line(sprintf('  → A DESACTIVAR (tienen ventas/preventas/apartados): %d', count($aDesactivar)));
        $this->line(sprintf('  → A BORRAR físico: %d', count($aBorrar)));
        $this->line(sprintf('  Quedarían: %d productos', $totalProductos - count($aBorrar)));

        if ($this->option('dry-run')) {
            $this->info('Dry-run: no se escribió nada.');

            return self::SUCCESS;
        }
        if (count($aBorrar) === 0 && count($aDesactivar) === 0) {
            $this->info('Nada que purgar.');

            return self::SUCCESS;
        }
        if (! $this->option('force')
            && ! $this->confirm(sprintf('¿Borrar %d y desactivar %d productos en %s?',
                count($aBorrar), count($aDesactivar), $host ?: $connName))) {
            return self::FAILURE;
        }

        $chunk = max(50, (int) $this->option('chunk'));
        $now = now();
        $userId = (int) $this->option('user');

        $db->transaction(function () use ($db, $aDesactivar, $aBorrar, $chunk, $now, $userId, $totalMangas) {
            foreach (array_chunk($aDesactivar, $chunk) as $lote) {
                $db->table('products')->whereIn('id', $lote)
                    ->update(['active' => false, 'updated_at' => $now]);
            }
            foreach (array_chunk($aBorrar, $chunk) as $lote) {
                // La FK de product_promotions es CASCADE: sin esto, borrar el
                // producto "ancla" mataría la promo aunque tenga asignaciones.
                $db->table('product_promotions')->whereIn('product_id', $lote)
                    ->update(['product_id' => null]);
                $db->table('products')->whereIn('id', $lote)->delete();
            }

            $db->table('system_logs')->insert([
                'user_id' => $userId,
                'action' => 'products.purged_no_stock',
                'entity_type' => 'product',
                'entity_id' => null,
                'description' => sprintf('Purga sin-stock: %d borrados, %d desactivados (mangas/librería protegidos: %d)',
                    count($aBorrar), count($aDesactivar), $totalMangas),
                'meta' => json_encode(['deleted' => count($aBorrar), 'deactivated' => count($aDesactivar)]),
                'created_at' => $now,
            ]);
        });

        // ── Verificación ─────────────────────────────────────────────────────
        $this->info('── Verificación ──');
        $quedan = $db->table('products')->count();
        $mangasDespues = $db->table('products')->where('product_type', 'manga')->count();
        $okMangas = $mangasDespues === $totalMangas;
        $this->line(sprintf('  Productos: %d → %d', $totalProductos, $quedan));
        $this->line(sprintf('  Mangas intactos: %d / %d %s', $mangasDespues, $totalMangas, $okMangas ? '✓' : '✗'));
        $borrarRestantes = count($aBorrar) > 0
            ? $db->table('products')->whereIn('id', array_slice($aBorrar, 0, 1000))->count()
            : 0;
        $this->line(sprintf('  Muestra de borrados aún presentes: %d %s', $borrarRestantes, $borrarRestantes === 0 ? '✓' : '✗'));

        if ($okMangas && $borrarRestantes === 0) {
            $this->info('Purga verificada. ✓');

            return self::SUCCESS;
        }
        $this->error('La verificación NO cuadró — revisar.');

        return self::FAILURE;
    }
}
