<?php

namespace App\Console\Commands;

use Illuminate\Console\Command;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Copia TODA la data de producción de MySQL (Cloud SQL vía proxy local) al
 * Postgres de Supabase (conexión pgsql_target) — migración 2026-07/08.
 *
 * Reglas load-bearing:
 * - SIEMPRE por nombre de columna (40 migraciones usan ->after(): el orden
 *   físico difiere entre motores — un SELECT * posicional corrompería).
 * - Las 31 columnas boolean del target se castean (MySQL entrega tinyint 0/1;
 *   Postgres boolean real rechaza enteros).
 * - Ciclo FK users↔companies↔stores: los constraints se vuelven DEFERRABLE y
 *   toda la copia corre en UNA transacción con SET CONSTRAINTS ALL DEFERRED.
 * - Al final se ajustan TODAS las secuencias (setval a MAX(id)+1) — sin esto,
 *   el primer INSERT de la app tronaría con id duplicado.
 * - Idempotente vía --fresh (TRUNCATE ... RESTART IDENTITY CASCADE).
 *
 * El comando se ELIMINA (junto con la conexión pgsql_target) al terminar la
 * migración — Fase 7 del plan.
 */
class CopyToPgsqlCommand extends Command
{
    protected $signature = 'tadaima:copy-to-pgsql
        {--fresh : TRUNCATE del target antes de copiar (re-corridas idempotentes)}
        {--chunk=500 : Filas por lote}
        {--verify-only : Solo comparar conteos/sumas, sin copiar}
        {--unsafe-host : Permitir un target que no sea *.supabase.co (QA local)}';

    protected $description = 'Copia la data completa de MySQL (source) a Postgres/Supabase (pgsql_target)';

    /**
     * Orden FK-safe (padres antes que hijos). Excluidas a propósito:
     * migrations (el target tiene la suya del migrate --force), sessions,
     * cache, cache_locks, jobs, job_batches, failed_jobs (efímeras/vacías).
     */
    private const TABLES = [
        // Raíces sin FKs
        'companies', 'product_categories', 'payment_methods', 'suppliers',
        'customers', 'roles', 'permissions',
        // Ciclo diferido: users ↔ companies ↔ stores
        'users', 'stores', 'warehouses',
        // RBAC pivotes
        'role_has_permissions', 'model_has_roles', 'model_has_permissions',
        // Catálogo de productos
        'products', 'product_prices', 'product_store_prices',
        'product_payment_methods', 'product_images', 'product_manga_details',
        'mangas',
        // Infra de tienda
        'terminals', 'store_payment_methods', 'customer_credit',
        'cash_registers', 'cash_register_sessions', 'cash_movements',
        // Inventario
        'inventory', 'inventory_movements', 'transfers', 'transfer_items',
        // Ventas
        'sales_drafts', 'sales_draft_items', 'sales', 'sale_items', 'payments',
        // Catálogo online + sistema
        'catalog_settings', 'catalog_products', 'system_settings', 'system_logs',
        // Apartados + lealtad + avisos
        'layaways', 'layaway_payments', 'layaway_logs',
        'point_transactions', 'notifications',
        // Preventas
        'pre_sale_catalogs', 'pre_sale_catalog_store_limits',
        'pre_sale_orders', 'pre_sale_order_items', 'pre_sale_order_payments',
        'pre_sale_order_logs',
        // Mangas legacy + cancelaciones
        'manga_inventory', 'sale_cancellations',
        // Insumos + promos
        'supplies', 'supply_movements',
        'product_promotions', 'product_promotion_assignments',
        // Auth (los Bearer de Sanctum DEBEN sobrevivir el cutover)
        'personal_access_tokens', 'password_reset_tokens',
    ];

    public function handle(): int
    {
        $src = DB::connection('mysql');
        $dst = DB::connection('pgsql_target');

        // ── Guards ───────────────────────────────────────────────────────────
        if (app()->environment('production')) {
            $this->error('Este comando NUNCA corre en producción (es una herramienta local).');
            return self::FAILURE;
        }
        if ($src->getDriverName() !== 'mysql') {
            $this->error('La conexión source debe ser mysql (Cloud SQL vía proxy).');
            return self::FAILURE;
        }
        $dstHost = (string) config('database.connections.pgsql_target.host');
        if ($dstHost === '') {
            $this->error('Falta POS_PG_HOST en el .env (host del session pooler de Supabase).');
            return self::FAILURE;
        }
        if (! str_contains($dstHost, 'supabase.co') && ! $this->option('unsafe-host')) {
            $this->error("El target ({$dstHost}) no es Supabase — usa --unsafe-host si es intencional (QA local).");
            return self::FAILURE;
        }

        if ($this->option('verify-only')) {
            return $this->verify($src, $dst);
        }

        $this->warn("Source: MySQL {$src->getDatabaseName()} · Target: {$dstHost}/{$dst->getDatabaseName()}");
        if (! $this->confirm('¿Copiar TODA la data al target?')) {
            return self::FAILURE;
        }

        $chunk = max(50, (int) $this->option('chunk'));

        // ── FKs del ciclo users↔companies↔stores → DEFERRABLE (permanente e
        // inocuo: siguen validando al COMMIT). El rol postgres es dueño de las
        // tablas (él migró), así que ALTER TABLE siempre está permitido.
        $circulares = $dst->select("
            SELECT conname, conrelid::regclass AS tbl
            FROM pg_constraint
            WHERE contype = 'f' AND connamespace = 'public'::regnamespace
              AND conrelid::regclass::text  IN ('users', 'companies', 'stores')
              AND confrelid::regclass::text IN ('users', 'companies', 'stores')");
        foreach ($circulares as $c) {
            $dst->statement("ALTER TABLE {$c->tbl} ALTER CONSTRAINT {$c->conname} DEFERRABLE INITIALLY IMMEDIATE");
            $this->line("  DEFERRABLE: {$c->tbl}.{$c->conname}");
        }

        if ($this->option('fresh')) {
            $lista = implode(', ', array_map(fn ($t) => "\"{$t}\"", self::TABLES));
            $dst->statement("TRUNCATE TABLE {$lista} RESTART IDENTITY CASCADE");
            $this->info('Target truncado (--fresh).');
        }

        // ── Columnas boolean del TARGET (fuente de verdad para el cast) ──────
        $boolMap = collect($dst->select("
            SELECT table_name, column_name FROM information_schema.columns
            WHERE table_schema = 'public' AND data_type = 'boolean'"))
            ->groupBy('table_name')
            ->map(fn ($cols) => $cols->pluck('column_name')->all());

        $totales = [];
        $dst->transaction(function () use ($src, $dst, $chunk, $boolMap, &$totales) {
            $dst->statement('SET CONSTRAINTS ALL DEFERRED');

            foreach (self::TABLES as $table) {
                if (! Schema::connection('mysql')->hasTable($table)) {
                    $this->warn("  {$table}: no existe en source — omitida");
                    continue;
                }
                $cols = Schema::connection('mysql')->getColumnListing($table);
                $orderCol = in_array('id', $cols, true) ? 'id' : $cols[0];
                $bools = $boolMap[$table] ?? [];
                $copied = 0;

                $src->table($table)->orderBy($orderCol)->chunk($chunk, function ($rows) use ($dst, $table, $bools, &$copied) {
                    $batch = [];
                    foreach ($rows as $row) {
                        $assoc = (array) $row;
                        foreach ($bools as $bc) {
                            if (array_key_exists($bc, $assoc) && $assoc[$bc] !== null) {
                                $assoc[$bc] = (bool) $assoc[$bc];
                            }
                        }
                        $batch[] = $assoc;
                    }
                    $dst->table($table)->insert($batch);
                    $copied += count($batch);
                });

                $totales[$table] = $copied;
                $this->line(sprintf('  %-36s %6d filas', $table, $copied));
            }
        });

        // ── Secuencias: setval a MAX(id)+1 (genérico sobre columnas serial) ──
        $serials = $dst->select("
            SELECT table_name, column_name FROM information_schema.columns
            WHERE table_schema = 'public' AND column_default LIKE 'nextval(%'");
        foreach ($serials as $s) {
            $dst->statement("
                SELECT setval(
                    pg_get_serial_sequence('public.\"{$s->table_name}\"', '{$s->column_name}'),
                    COALESCE((SELECT MAX(\"{$s->column_name}\") FROM \"{$s->table_name}\"), 0) + 1,
                    false)");
        }
        $this->info('Secuencias ajustadas (' . count($serials) . ').');

        return $this->verify($src, $dst);
    }

    /** Conteos por tabla + spot checks de dinero/ids. Exit 1 si algo difiere. */
    private function verify($src, $dst): int
    {
        $this->newLine();
        $this->info('── Verificación ──');
        $ok = true;

        foreach (self::TABLES as $table) {
            if (! Schema::connection('mysql')->hasTable($table)) {
                continue;
            }
            $a = (int) $src->table($table)->count();
            $b = (int) $dst->table($table)->count();
            if ($a !== $b) {
                $ok = false;
                $this->error(sprintf('  %-36s source=%d target=%d  ✗', $table, $a, $b));
            }
        }
        if ($ok) {
            $this->info('  Conteos por tabla: todos idénticos ✓');
        }

        // Sumas de dinero y máximos — comparados como string normalizado (sin
        // float drift). NULL → '0.00'.
        $spots = [
            ['sales',                  'SUM(total)',   'suma de ventas'],
            ['sale_items',             'SUM(total)',   'suma de líneas'],
            ['payments',               'SUM(amount)',  'suma de pagos'],
            ['pre_sale_order_payments', 'SUM(amount)', 'suma anticipos preventa'],
            ['cash_movements',         'SUM(amount)',  'suma movimientos caja'],
            ['inventory',              'SUM(quantity)', 'suma existencias'],
            ['sales',                  'MAX(id)',      'max id ventas'],
            ['users',                  'MAX(id)',      'max id usuarios'],
            ['personal_access_tokens', 'COUNT(*)',     'tokens Sanctum'],
        ];
        foreach ($spots as [$table, $expr, $label]) {
            $a = $src->selectOne("SELECT {$expr} AS v FROM {$table}")->v ?? '0';
            $b = $dst->selectOne("SELECT {$expr} AS v FROM \"{$table}\"")->v ?? '0';
            $an = number_format((float) $a, 2, '.', '');
            $bn = number_format((float) $b, 2, '.', '');
            if ($an !== $bn) {
                $ok = false;
                $this->error("  {$label}: source={$an} target={$bn}  ✗");
            } else {
                $this->line("  {$label}: {$an} ✓");
            }
        }

        $this->newLine();
        if ($ok) {
            $this->info('Verificación COMPLETA: la copia es fiel. ✓');
            return self::SUCCESS;
        }
        $this->error('Verificación FALLÓ — revisa las diferencias antes de continuar.');
        return self::FAILURE;
    }
}
