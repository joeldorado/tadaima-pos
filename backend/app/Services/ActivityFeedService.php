<?php

declare(strict_types=1);

namespace App\Services;

use App\Support\ActivityFilters;
use App\Support\ActivityGroups;
use App\Support\DateRange;
use Carbon\Carbon;
use Illuminate\Database\Query\Builder;
use Illuminate\Support\Collection;
use Illuminate\Support\Facades\DB;

/**
 * Feed unificado de Actividad (solo admin): mezcla `inventory_movements`
 * (lo que pasó con el stock) y `system_logs` (ediciones, borrados,
 * cancelaciones, cortes…) en una sola línea de tiempo paginada en el servidor.
 *
 * Estrategia: dos subconsultas normalizadas a las MISMAS columnas, cada una
 * ya filtrada (usa los índices de su tabla), unidas con UNION ALL y
 * paginadas con `fromSub`. En SQL solo van columnas comunes; `old/new`,
 * snapshots, títulos y grupos se resuelven en PHP sobre la página.
 * Todo Query Builder: corre igual en Postgres (prod) y SQLite (tests).
 */
final class ActivityFeedService
{
    private const SOURCE_MOVEMENT = 'mov';

    private const SOURCE_LOG = 'log';

    /** Acciones de log cuyo producto se reconstruye desde `meta.snapshot`. */
    private const DELETED_PRODUCT_ACTIONS = ['product.deleted', 'product.force_deleted', 'manga.deleted', 'bundle.deleted'];

    /**
     * @return array{data: list<array<string, mixed>>, pagination: array{total: int, per_page: int, current_page: int, last_page: int}}
     */
    public function feed(ActivityFilters $f, int $perPage, int $page): array
    {
        $paginator = $this->unionQuery($f)->paginate($perPage, ['*'], 'page', $page);

        return [
            'data'       => $this->hydrate(collect($paginator->items())),
            'pagination' => [
                'total'        => $paginator->total(),
                'per_page'     => $paginator->perPage(),
                'current_page' => $paginator->currentPage(),
                'last_page'    => $paginator->lastPage(),
            ],
        ];
    }

    /**
     * Eventos normalizados en lotes (para el CSV). Tope `$max` filas.
     *
     * @return \Generator<int, array<string, mixed>>
     */
    public function export(ActivityFilters $f, int $max = 20000, int $batch = 1000): \Generator
    {
        $emitted = 0;
        for ($page = 1; $emitted < $max; $page++) {
            $rows = $this->unionQuery($f)->forPage($page, min($batch, $max - $emitted))->get();
            if ($rows->isEmpty()) {
                return;
            }
            foreach ($this->hydrate($rows) as $event) {
                yield $event;
                $emitted++;
            }
            if ($rows->count() < $batch) {
                return;
            }
        }
    }

    /** @return array<string, mixed> */
    public function summary(ActivityFilters $f): array
    {
        $movs = $this->movementsBase($f);
        $logs = $this->logsBase($f);

        // Los totales salen de las agregaciones por tipo/acción (sin COUNT aparte):
        // cada ida a la base cuesta y el resumen ya hace varias.
        $totalMovs = 0;
        $totalLogs = 0;

        // ── Por grupo / acción ───────────────────────────────────────────────
        $byGroup = [];
        $byAction = [];
        $movRows = (clone $movs)
            ->selectRaw("m.type as type, CASE WHEN m.reference LIKE 'PAQ-%' THEN 'PAQ-' WHEN m.reference LIKE 'BORRADO-CORTE-%' THEN 'BORRADO-CORTE-' ELSE '' END as ovr, COUNT(*) as c")
            ->groupByRaw("m.type, CASE WHEN m.reference LIKE 'PAQ-%' THEN 'PAQ-' WHEN m.reference LIKE 'BORRADO-CORTE-%' THEN 'BORRADO-CORTE-' ELSE '' END")
            ->get();
        foreach ($movRows as $r) {
            $totalMovs += (int) $r->c;
            $ref = $r->ovr !== '' ? $r->ovr.'x' : null;
            $group = ActivityGroups::movementGroup($r->type, $ref);
            $key = ActivityGroups::MOVEMENT_ACTION_PREFIX.$r->type.($r->ovr !== '' ? '@'.rtrim($r->ovr, '-') : '');
            $byGroup[$group] = ($byGroup[$group] ?? 0) + (int) $r->c;
            $byAction[$key] = [
                'action' => $key,
                'title'  => ActivityGroups::movementTitle($r->type, $ref),
                'group'  => $group,
                'count'  => ($byAction[$key]['count'] ?? 0) + (int) $r->c,
            ];
        }
        $logRows = (clone $logs)->selectRaw('l.action as action, COUNT(*) as c')->groupBy('l.action')->get();
        foreach ($logRows as $r) {
            $totalLogs += (int) $r->c;
            $group = ActivityGroups::logGroup($r->action);
            $byGroup[$group] = ($byGroup[$group] ?? 0) + (int) $r->c;
            $byAction[$r->action] = [
                'action' => $r->action,
                'title'  => ActivityGroups::logTitle($r->action, null),
                'group'  => $group,
                'count'  => (int) $r->c,
            ];
        }
        arsort($byGroup);
        $byAction = array_values($byAction);
        usort($byAction, fn ($a, $b) => $b['count'] <=> $a['count']);

        // ── Por usuario ─────────────────────────────────────────────────────
        $byUser = [];
        foreach ((clone $movs)->selectRaw('m.user_id as uid, COUNT(*) as c')->groupBy('m.user_id')->get() as $r) {
            $byUser[$r->uid ?? 0] = ($byUser[$r->uid ?? 0] ?? 0) + (int) $r->c;
        }
        foreach ((clone $logs)->selectRaw('l.user_id as uid, COUNT(*) as c')->groupBy('l.user_id')->get() as $r) {
            $byUser[$r->uid ?? 0] = ($byUser[$r->uid ?? 0] ?? 0) + (int) $r->c;
        }
        arsort($byUser);
        $byUser = array_slice($byUser, 0, 10, true);
        $users = $this->lookupUsers(array_keys($byUser));
        $byUserOut = [];
        foreach ($byUser as $uid => $count) {
            $byUserOut[] = ['user' => $uid ? ($users[$uid] ?? ['id' => $uid, 'name' => "Usuario #{$uid}"]) : null, 'count' => $count];
        }

        // ── Por día de negocio ──────────────────────────────────────────────
        $byDay = [];
        $dayMov = DateRange::businessDayExpr('m.created_at');
        $dayLog = DateRange::businessDayExpr('l.created_at');
        foreach ((clone $movs)->selectRaw("{$dayMov} as d, COUNT(*) as c")->groupByRaw($dayMov)->get() as $r) {
            $byDay[(string) $r->d] = ($byDay[(string) $r->d] ?? 0) + (int) $r->c;
        }
        foreach ((clone $logs)->selectRaw("{$dayLog} as d, COUNT(*) as c")->groupByRaw($dayLog)->get() as $r) {
            $byDay[(string) $r->d] = ($byDay[(string) $r->d] ?? 0) + (int) $r->c;
        }
        ksort($byDay);
        $byDayOut = [];
        foreach ($byDay as $day => $count) {
            $byDayOut[] = ['day' => substr($day, 0, 10), 'count' => $count];
        }

        // ── Productos más tocados ───────────────────────────────────────────
        $byProduct = [];
        foreach ((clone $movs)->selectRaw('m.product_id as pid, COUNT(*) as c')->groupBy('m.product_id')->get() as $r) {
            $byProduct[(int) $r->pid] = ($byProduct[(int) $r->pid] ?? 0) + (int) $r->c;
        }
        $logProducts = (clone $logs)
            ->whereIn('l.entity_type', ActivityGroups::PRODUCT_ENTITY_TYPES)
            ->whereNotNull('l.entity_id')
            ->selectRaw('l.entity_id as pid, COUNT(*) as c')
            ->groupBy('l.entity_id')
            ->get();
        foreach ($logProducts as $r) {
            $byProduct[(int) $r->pid] = ($byProduct[(int) $r->pid] ?? 0) + (int) $r->c;
        }
        arsort($byProduct);
        $byProduct = array_slice($byProduct, 0, 10, true);
        $products = $this->lookupProducts(array_keys($byProduct));
        $snapshots = $this->lookupDeletedSnapshots(array_diff(array_keys($byProduct), array_keys($products)));
        $topProducts = [];
        foreach ($byProduct as $pid => $count) {
            $topProducts[] = ['product' => $products[$pid] ?? $snapshots[$pid] ?? ['id' => $pid, 'name' => "Producto #{$pid}", 'sku' => null, 'type' => null, 'deleted' => true], 'count' => $count];
        }

        // ── Ruido excluido (se calcula sobre la base SIN filtro de ruido) ───
        $noisy = $f->withNoise(true);
        $zeroAdjustments = (int) $this->movementsBase($noisy)
            ->where('m.type', 'ajuste')->where('m.quantity', 0)->count();
        $noiseLogs = $this->logsBase($noisy)
            ->selectRaw("SUM(CASE WHEN l.action IN ('qz_print_ok', 'qz_print_error') THEN 1 ELSE 0 END) as prints, "
                ."SUM(CASE WHEN l.action = 'inventory.adjusted' THEN 1 ELSE 0 END) as dups")
            ->first();
        $printLogs = (int) ($noiseLogs->prints ?? 0);
        $dupAdjustLogs = (int) ($noiseLogs->dups ?? 0);

        return [
            'range' => ['from' => $f->from, 'to' => $f->to, 'dates' => $f->dates, 'narrow' => $f->isNarrow()],
            'totals' => ['events' => $totalMovs + $totalLogs, 'movements' => $totalMovs, 'logs' => $totalLogs],
            'by_group' => array_map(fn ($g, $c) => ['group' => $g, 'count' => $c], array_keys($byGroup), $byGroup),
            'by_action' => $byAction,
            'by_user' => $byUserOut,
            'by_day' => $byDayOut,
            'top_products' => $topProducts,
            'noise_excluded' => [
                'zero_adjustments'      => $zeroAdjustments,
                'print_logs'            => $printLogs,
                'duplicate_adjust_logs' => $dupAdjustLogs,
            ],
        ];
    }

    // ─── Consultas base ───────────────────────────────────────────────────────

    private function unionQuery(ActivityFilters $f): Builder
    {
        $union = $this->movementsSelect($this->movementsBase($f))
            ->unionAll($this->logsSelect($this->logsBase($f)));

        return DB::query()->fromSub($union, 'events')
            ->orderByDesc('occurred_at')
            ->orderByDesc('source')
            ->orderByDesc('id');
    }

    private function movementsSelect(Builder $q): Builder
    {
        return $q->selectRaw(
            "'".self::SOURCE_MOVEMENT."' as source, m.id as id, m.created_at as occurred_at, m.user_id as user_id, "
            .'m.product_id as product_id, m.warehouse_id as warehouse_id, m.type as action, m.quantity as qty, '
            .'m.reference as reference, m.notes as text, NULL as entity_type, NULL as entity_id, NULL as meta'
        );
    }

    private function logsSelect(Builder $q): Builder
    {
        $types = "'".implode("','", ActivityGroups::PRODUCT_ENTITY_TYPES)."'";

        return $q->selectRaw(
            "'".self::SOURCE_LOG."' as source, l.id as id, l.created_at as occurred_at, l.user_id as user_id, "
            ."CASE WHEN l.entity_type IN ({$types}) THEN l.entity_id ELSE NULL END as product_id, "
            .'NULL as warehouse_id, l.action as action, NULL as qty, NULL as reference, l.description as text, '
            .'l.entity_type as entity_type, l.entity_id as entity_id, l.meta as meta'
        );
    }

    private function movementsBase(ActivityFilters $f): Builder
    {
        $q = DB::table('inventory_movements as m');
        DateRange::applyDates($q, 'm.created_at', $f->dates, $f->from, $f->to);

        if ($f->userId !== null) {
            $q->where('m.user_id', $f->userId);
        }
        if ($f->productIds !== []) {
            $q->whereIn('m.product_id', $f->productIds);
        }
        if ($f->storeId !== null) {
            $q->whereIn('m.warehouse_id', fn ($s) => $s->select('id')->from('warehouses')->where('store_id', $f->storeId));
        }
        if ($f->action !== null) {
            if (ActivityGroups::isMovementAction($f->action)) {
                $q->where('m.type', ActivityGroups::movementTypeFromAction($f->action));
            } else {
                $q->whereRaw('1 = 0');
            }
        }
        if ($f->groups !== []) {
            $this->applyMovementGroups($q, $f->groups);
        }
        if (! $f->includeNoise) {
            $q->where(fn ($w) => $w->where('m.type', '!=', 'ajuste')->orWhere('m.quantity', '!=', 0));
        }
        if ($f->search !== null) {
            $like = '%'.$f->search.'%';
            $q->where(function ($w) use ($like) {
                $w->whereLike('m.reference', $like, caseSensitive: false)
                    ->orWhereLike('m.notes', $like, caseSensitive: false)
                    ->orWhereIn('m.product_id', fn ($s) => $this->productSearchSub($s, $like));
            });
        }

        return $q;
    }

    private function logsBase(ActivityFilters $f): Builder
    {
        $q = DB::table('system_logs as l');
        DateRange::applyDates($q, 'l.created_at', $f->dates, $f->from, $f->to);

        if ($f->userId !== null) {
            $q->where('l.user_id', $f->userId);
        }
        if ($f->productIds !== []) {
            $q->whereIn('l.entity_type', ActivityGroups::PRODUCT_ENTITY_TYPES)->whereIn('l.entity_id', $f->productIds);
        }
        if ($f->storeId !== null) {
            // Los logs no guardan tienda: con filtro de tienda solo quedan los movimientos.
            $q->whereRaw('1 = 0');
        }
        if ($f->action !== null) {
            if (ActivityGroups::isMovementAction($f->action)) {
                $q->whereRaw('1 = 0');
            } else {
                $q->where('l.action', $f->action);
            }
        }
        if ($f->groups !== []) {
            ['in' => $in, 'catch_unknown' => $catchUnknown] = ActivityGroups::logActionsFor($f->groups);
            $q->where(function ($w) use ($in, $catchUnknown) {
                $w->whereIn('l.action', $in !== [] ? $in : ['__none__']);
                if ($catchUnknown) {
                    $w->orWhereNotIn('l.action', ActivityGroups::knownLogActions());
                }
            });
        }
        if (! $f->includeNoise) {
            $q->whereNotIn('l.action', ActivityGroups::NOISE_LOG_ACTIONS);
        }
        if ($f->search !== null) {
            $like = '%'.$f->search.'%';
            $q->where(function ($w) use ($like) {
                $w->whereLike('l.description', $like, caseSensitive: false)
                    ->orWhereLike('l.action', $like, caseSensitive: false)
                    ->orWhere(fn ($p) => $p->whereIn('l.entity_type', ActivityGroups::PRODUCT_ENTITY_TYPES)
                        ->whereIn('l.entity_id', fn ($s) => $this->productSearchSub($s, $like)));
            });
        }

        return $q;
    }

    private function productSearchSub(Builder $s, string $like): Builder
    {
        return $s->select('id')->from('products')->where(function ($p) use ($like) {
            $p->whereLike('name', $like, caseSensitive: false)
                ->orWhereLike('sku', $like, caseSensitive: false)
                ->orWhereLike('barcode', $like, caseSensitive: false);
        });
    }

    /**
     * Grupo de un movimiento = su tipo, salvo que la referencia lo mande a
     * `paquete` (PAQ-) o `caja` (BORRADO-CORTE-).
     *
     * @param  list<string>  $groups
     */
    private function applyMovementGroups(Builder $q, array $groups): void
    {
        $types = ActivityGroups::movementTypesFor($groups);
        $overridePrefixes = array_keys(ActivityGroups::REFERENCE_OVERRIDES);

        $q->where(function ($w) use ($types, $groups, $overridePrefixes) {
            $w->where(function ($plain) use ($types, $overridePrefixes) {
                $plain->whereIn('m.type', $types !== [] ? $types : ['__none__']);
                foreach ($overridePrefixes as $prefix) {
                    $plain->where(fn ($n) => $n->whereNull('m.reference')->orWhere('m.reference', 'not like', $prefix.'%'));
                }
            });
            foreach (ActivityGroups::REFERENCE_OVERRIDES as $prefix => [$group]) {
                if (in_array($group, $groups, true)) {
                    $w->orWhere('m.reference', 'like', $prefix.'%');
                }
            }
        });
    }

    // ─── Hidratación ──────────────────────────────────────────────────────────

    /**
     * @param  Collection<int, object>  $rows
     * @return list<array<string, mixed>>
     */
    private function hydrate(Collection $rows): array
    {
        $metas = [];
        foreach ($rows as $i => $row) {
            $metas[$i] = $row->source === self::SOURCE_LOG ? $this->decodeMeta($row->meta) : null;
        }

        $productIds = $rows->pluck('product_id')->filter()->map(fn ($v) => (int) $v)->all();
        $warehouseIds = $rows->pluck('warehouse_id')->filter()->map(fn ($v) => (int) $v)->all();
        $storeIds = [];
        foreach ($metas as $meta) {
            if (isset($meta['warehouse_id'])) {
                $warehouseIds[] = (int) $meta['warehouse_id'];
            }
            if (isset($meta['store_id'])) {
                $storeIds[] = (int) $meta['store_id'];
            }
        }
        $userIds = $rows->pluck('user_id')->filter()->map(fn ($v) => (int) $v)->all();

        $products = $this->lookupProducts(array_unique($productIds));
        $warehouses = $this->lookupWarehouses(array_unique($warehouseIds));
        $stores = $this->lookupStores(array_unique($storeIds));
        $users = $this->lookupUsers(array_unique($userIds));

        $out = [];
        foreach ($rows as $i => $row) {
            $out[] = $row->source === self::SOURCE_MOVEMENT
                ? $this->normalizeMovement($row, $products, $warehouses, $users)
                : $this->normalizeLog($row, $metas[$i], $products, $warehouses, $stores, $users);
        }

        return $out;
    }

    /**
     * @param  array<int, array<string, mixed>>  $products
     * @param  array<int, array<string, mixed>>  $warehouses
     * @param  array<int, array<string, mixed>>  $users
     * @return array<string, mixed>
     */
    private function normalizeMovement(object $row, array $products, array $warehouses, array $users): array
    {
        $type = (string) $row->action;
        $qty = (float) $row->qty;
        $warehouse = $warehouses[(int) $row->warehouse_id] ?? null;
        [$before, $after] = $type === 'ajuste' ? self::parseBeforeAfter($row->text) : [null, null];
        $productId = (int) $row->product_id;

        return [
            'id'           => self::SOURCE_MOVEMENT.':'.$row->id,
            'source'       => self::SOURCE_MOVEMENT,
            'at'           => self::iso($row->occurred_at),
            'user'         => $row->user_id ? ($users[(int) $row->user_id] ?? ['id' => (int) $row->user_id, 'name' => 'Usuario #'.$row->user_id]) : null,
            'group'        => ActivityGroups::movementGroup($type, $row->reference),
            'action'       => ActivityGroups::MOVEMENT_ACTION_PREFIX.$type,
            'title'        => ActivityGroups::movementTitle($type, $row->reference),
            'product'      => $products[$productId] ?? ['id' => $productId, 'name' => "Producto #{$productId}", 'sku' => null, 'type' => null, 'deleted' => true],
            'store'        => $warehouse ? $warehouse['store'] : null,
            'warehouse'    => $warehouse ? ['id' => $warehouse['id'], 'name' => $warehouse['name'], 'type' => $warehouse['type']] : null,
            'qty_delta'    => self::stockDelta($type, $qty),
            'stock_before' => $before,
            'stock_after'  => $after,
            'reference'    => $row->reference,
            'meta'         => ['type' => $type, 'quantity' => $qty, 'notes' => $row->text],
        ];
    }

    /**
     * @param  array<string, mixed>|null  $meta
     * @param  array<int, array<string, mixed>>  $products
     * @param  array<int, array<string, mixed>>  $warehouses
     * @param  array<int, array<string, mixed>>  $stores
     * @param  array<int, array<string, mixed>>  $users
     * @return array<string, mixed>
     */
    private function normalizeLog(object $row, ?array $meta, array $products, array $warehouses, array $stores, array $users): array
    {
        $action = (string) $row->action;
        $productId = $row->product_id !== null ? (int) $row->product_id : null;

        $product = null;
        if ($productId !== null) {
            $product = $products[$productId] ?? null;
            if ($product === null) {
                $snapshot = is_array($meta['snapshot'] ?? null) ? $meta['snapshot'] : [];
                $product = [
                    'id'      => $productId,
                    'name'    => (string) ($snapshot['name'] ?? $meta['name'] ?? self::nameFromDescription((string) $row->text) ?? "Producto #{$productId}"),
                    'sku'     => $snapshot['sku'] ?? $meta['sku'] ?? null,
                    'type'    => $snapshot['product_type'] ?? null,
                    'deleted' => true,
                ];
            } elseif (in_array($action, self::DELETED_PRODUCT_ACTIONS, true)) {
                // El id se reutilizó o el borrado falló: lo marcamos igual.
                $product = $product + ['deleted' => true];
            }
        }

        $warehouse = isset($meta['warehouse_id']) ? ($warehouses[(int) $meta['warehouse_id']] ?? null) : null;
        $store = $warehouse['store'] ?? (isset($meta['store_id']) ? ($stores[(int) $meta['store_id']] ?? null) : null);

        $before = isset($meta['old']) && is_numeric($meta['old']) ? (float) $meta['old'] : null;
        $after = isset($meta['new']) && is_numeric($meta['new']) ? (float) $meta['new'] : null;
        $delta = isset($meta['delta']) && is_numeric($meta['delta']) ? (float) $meta['delta'] : null;

        return [
            'id'           => self::SOURCE_LOG.':'.$row->id,
            'source'       => self::SOURCE_LOG,
            'at'           => self::iso($row->occurred_at),
            'user'         => $row->user_id ? ($users[(int) $row->user_id] ?? ['id' => (int) $row->user_id, 'name' => 'Usuario #'.$row->user_id]) : null,
            'group'        => ActivityGroups::logGroup($action),
            'action'       => $action,
            'title'        => ActivityGroups::logTitle($action, $meta),
            'product'      => $product,
            'store'        => $store,
            'warehouse'    => $warehouse ? ['id' => $warehouse['id'], 'name' => $warehouse['name'], 'type' => $warehouse['type']] : null,
            'qty_delta'    => $action === 'inventory.adjusted' ? $delta : null,
            'stock_before' => $action === 'inventory.adjusted' ? $before : null,
            'stock_after'  => $action === 'inventory.adjusted' ? $after : null,
            'reference'    => null,
            'description'  => $row->text,
            'entity'       => $row->entity_type ? ['type' => $row->entity_type, 'id' => $row->entity_id !== null ? (int) $row->entity_id : null] : null,
            'meta'         => $meta,
        ];
    }

    // ─── Lookups ──────────────────────────────────────────────────────────────

    /**
     * @param  list<int>  $ids
     * @return array<int, array{id: int, name: string, sku: ?string, type: ?string, deleted: bool}>
     */
    private function lookupProducts(array $ids): array
    {
        if ($ids === []) {
            return [];
        }
        $out = [];
        foreach (DB::table('products')->whereIn('id', $ids)->get(['id', 'name', 'sku', 'product_type']) as $p) {
            $out[(int) $p->id] = ['id' => (int) $p->id, 'name' => (string) $p->name, 'sku' => $p->sku, 'type' => $p->product_type, 'deleted' => false];
        }

        return $out;
    }

    /**
     * Productos que ya no existen: reconstruye nombre/SKU desde el último log
     * de borrado (`meta.snapshot`), si lo hay.
     *
     * @param  array<int|string, int>  $ids
     * @return array<int, array{id: int, name: string, sku: ?string, type: ?string, deleted: bool}>
     */
    private function lookupDeletedSnapshots(array $ids): array
    {
        $ids = array_values(array_map('intval', $ids));
        if ($ids === []) {
            return [];
        }
        $out = [];
        $rows = DB::table('system_logs')
            ->whereIn('action', self::DELETED_PRODUCT_ACTIONS)
            ->whereIn('entity_id', $ids)
            ->orderByDesc('id')
            ->get(['entity_id', 'meta', 'description']);
        foreach ($rows as $r) {
            $pid = (int) $r->entity_id;
            if (isset($out[$pid])) {
                continue;
            }
            $meta = $this->decodeMeta($r->meta) ?? [];
            $snapshot = is_array($meta['snapshot'] ?? null) ? $meta['snapshot'] : [];
            $out[$pid] = [
                'id'      => $pid,
                'name'    => (string) ($snapshot['name'] ?? self::nameFromDescription((string) $r->description) ?? "Producto #{$pid}"),
                'sku'     => $snapshot['sku'] ?? null,
                'type'    => $snapshot['product_type'] ?? null,
                'deleted' => true,
            ];
        }

        return $out;
    }

    /**
     * @param  list<int>  $ids
     * @return array<int, array{id: int, name: string, type: ?string, store: ?array{id: int, name: string}}>
     */
    private function lookupWarehouses(array $ids): array
    {
        if ($ids === []) {
            return [];
        }
        $out = [];
        $rows = DB::table('warehouses as w')
            ->leftJoin('stores as s', 's.id', '=', 'w.store_id')
            ->whereIn('w.id', $ids)
            ->get(['w.id', 'w.name', 'w.type', 's.id as store_id', 's.name as store_name']);
        foreach ($rows as $w) {
            $out[(int) $w->id] = [
                'id'    => (int) $w->id,
                'name'  => (string) $w->name,
                'type'  => $w->type,
                'store' => $w->store_id ? ['id' => (int) $w->store_id, 'name' => (string) $w->store_name] : null,
            ];
        }

        return $out;
    }

    /**
     * @param  list<int>  $ids
     * @return array<int, array{id: int, name: string}>
     */
    private function lookupStores(array $ids): array
    {
        if ($ids === []) {
            return [];
        }
        $out = [];
        foreach (DB::table('stores')->whereIn('id', $ids)->get(['id', 'name']) as $s) {
            $out[(int) $s->id] = ['id' => (int) $s->id, 'name' => (string) $s->name];
        }

        return $out;
    }

    /**
     * @param  list<int|string>  $ids
     * @return array<int, array{id: int, name: string}>
     */
    private function lookupUsers(array $ids): array
    {
        $ids = array_values(array_filter(array_map('intval', $ids)));
        if ($ids === []) {
            return [];
        }
        $out = [];
        foreach (DB::table('users')->whereIn('id', $ids)->get(['id', 'name']) as $u) {
            $out[(int) $u->id] = ['id' => (int) $u->id, 'name' => (string) $u->name];
        }

        return $out;
    }

    // ─── Helpers puros ────────────────────────────────────────────────────────

    /** @return array<string, mixed>|null */
    private function decodeMeta(mixed $raw): ?array
    {
        if ($raw === null || $raw === '') {
            return null;
        }
        if (is_array($raw)) {
            return $raw;
        }
        $decoded = json_decode((string) $raw, true);

        return is_array($decoded) ? $decoded : null;
    }

    /**
     * "Ajuste manual: 10 → 8" (o "10 -> 8") ⇒ [10.0, 8.0]; sin match ⇒ [null, null].
     *
     * @return array{0: ?float, 1: ?float}
     */
    public static function parseBeforeAfter(?string $notes): array
    {
        if ($notes === null) {
            return [null, null];
        }
        if (preg_match('/(-?\d+(?:[.,]\d+)?)\s*(?:→|->)\s*(-?\d+(?:[.,]\d+)?)/u', $notes, $m)) {
            return [(float) str_replace(',', '.', $m[1]), (float) str_replace(',', '.', $m[2])];
        }

        return [null, null];
    }

    /** Misma regla que `InventoryMovement::stockDelta()`. */
    public static function stockDelta(string $type, float $qty): float
    {
        if (in_array($type, \App\Models\InventoryMovement::TYPES_INCREASE, true)) {
            return abs($qty);
        }
        if (in_array($type, \App\Models\InventoryMovement::TYPES_DECREASE, true)) {
            return -abs($qty);
        }

        return $qty;
    }

    /** "Producto eliminado: Nombre (SKU: X)" ⇒ "Nombre". */
    private static function nameFromDescription(string $description): ?string
    {
        if (preg_match('/^[^:]+:\s*(.+?)(?:\s*\(SKU:.*\))?$/u', $description, $m)) {
            return trim($m[1]) !== '' ? trim($m[1]) : null;
        }

        return null;
    }

    private static function iso(mixed $value): ?string
    {
        if ($value === null) {
            return null;
        }
        try {
            return Carbon::parse((string) $value, 'UTC')->toISOString();
        } catch (\Throwable) {
            return (string) $value;
        }
    }
}
