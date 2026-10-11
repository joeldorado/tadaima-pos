<?php

declare(strict_types=1);

namespace App\Services;

use App\Http\Controllers\Api\ProductController;
use App\Models\Layaway;
use App\Models\PreSaleOrder;
use App\Models\Product;
use App\Models\ProductBundleItem;
use App\Models\Transfer;
use App\Models\User;
use DomainException;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Storage;

/**
 * Eliminar producto con vista previa (Joel 2026-10-09).
 *
 * Antes de borrar, `preview()` enseña TODO lo que está en juego: stock por
 * tienda (Exhibición/Bodega), ventas que quedan en historial, apartados,
 * preventas, traslados pendientes, paquetes y promos — con avisos y bloqueos.
 * `delete()` es la ÚNICA puerta de borrado de productos y tomos
 * (ProductController::destroy/forceDestroy y MangaController::destroy): los
 * bloqueos viven aquí una sola vez.
 *
 * - Bloquean: apartados (solo el borrado normal; "Borrar TODO" los borra),
 *   ser componente de un paquete (FK restrict) y ser un paquete con alguna
 *   fila de inventory ≠ 0 (armados o un ajuste negativo).
 * - `expected` (opcional): los conteos que el usuario vio en la vista previa.
 *   Si vienen y cambiaron (entró stock, un apartado, un traslado) no se borra.
 *   La app móvil y los bundles viejos del PWA no lo mandan → siguen igual.
 * - El stock se pierde en cascade (sin movimiento de inventario): por eso el
 *   preview lo grita y el log guarda cuánto había y dónde (`audit`).
 */
final class ProductDeletionService
{
    public function __construct(private readonly BundleService $bundles)
    {
    }

    /**
     * Todo lo que el borrado tocaría. `blockers` no vacío = no se puede borrar
     * con "Solo el producto"; `force_blockers` = tampoco con "Borrar TODO".
     *
     * @return array<string, mixed>
     */
    public function preview(Product $product, User $user): array
    {
        $stock = $this->stockByStore($product, $user);
        $layawaysTotal = $this->layawaysCount($product);
        $layawaysOpen = Layaway::query()->where('product_id', $product->id)->whereIn('status', Layaway::OPEN_STATUSES)->count();
        $transfersPending = $this->pendingTransfers($product);
        $catalogs = DB::table('pre_sale_catalogs')->where('product_id', $product->id)->count();
        $openItems = $this->openPreSaleItems($product);
        $promos = DB::table('product_promotion_assignments')->where('product_id', $product->id)->distinct()->count('promotion_id');
        $movements = DB::table('inventory_movements')->where('product_id', $product->id)->count();
        $salesCount = DB::table('sale_items')->where('product_id', $product->id)->count();
        $lastSoldAt = DB::table('sale_items as si')
            ->join('sales as s', 's.id', '=', 'si.sale_id')
            ->where('si.product_id', $product->id)
            ->max('s.sold_at');

        $componentOf = Product::query()
            ->whereIn('id', ProductBundleItem::query()->where('component_product_id', $product->id)->select('bundle_product_id'))
            ->orderBy('name')
            ->get(['id', 'name', 'sku'])
            ->map(fn (Product $b) => ['id' => $b->id, 'name' => $b->name, 'sku' => $b->sku])
            ->values()
            ->all();
        $assembled = $product->isBundle() ? $this->bundles->totalStock($product) : 0.0;

        $warnings = [];
        if ($stock['total'] > 0) {
            $places = count($stock['stores']) + ($stock['central'] > 0 ? 1 : 0);
            $warnings[] = sprintf(
                'Tiene %s pieza(s) en existencia en %d tienda(s). Se PIERDEN al eliminar: no queda movimiento de inventario.',
                self::fmtQty($stock['total']), $places,
            );
        }
        if ($transfersPending > 0) {
            $warnings[] = "{$transfersPending} traslado(s) pendiente(s) incluyen este producto: la línea desaparecería del traslado sin aviso.";
        }
        if ($catalogs > 0) {
            $warnings[] = "Es el producto ligado a {$catalogs} catálogo(s) de preventa: el catálogo queda sin producto (los folios no se tocan).";
        }
        if ($openItems > 0) {
            $warnings[] = "{$openItems} artículo(s) de folios de preventa abiertos apuntan a este producto.";
        }
        if ($promos > 0) {
            $warnings[] = "Está en {$promos} promoción(es); se quita de ellas.";
        }
        if ($movements > 0) {
            $warnings[] = "Se borra el historial de {$movements} movimiento(s) de inventario.";
        }

        $forceWarnings = [];
        if ($layawaysTotal > 0) {
            $forceWarnings[] = "Borrar TODO elimina también {$layawaysTotal} apartado(s) ({$layawaysOpen} abierto(s)) con sus abonos.";
        }

        return [
            'product' => [
                'id' => $product->id,
                'name' => $product->name,
                'sku' => $product->sku,
                'product_type' => $product->product_type,
                'active' => (bool) $product->active,
            ],
            'stock' => [
                'total' => $stock['total'],
                'central' => $stock['central'],
                'movements_count' => $movements,
                'stores' => $stock['stores'],
            ],
            'sales' => ['count' => $salesCount, 'last_sold_at' => $lastSoldAt !== null ? (string) $lastSoldAt : null],
            'layaways' => ['total' => $layawaysTotal, 'open' => $layawaysOpen],
            'presales' => ['catalogs' => $catalogs, 'open_items' => $openItems],
            'transfers' => ['pending' => $transfersPending],
            'bundles' => ['component_of' => $componentOf, 'assembled_stock' => $assembled],
            'promos' => ['count' => $promos],
            'counts' => [
                'stock_total' => $stock['total'],
                'layaways' => $layawaysTotal,
                'transfers_pending' => $transfersPending,
            ],
            'warnings' => $warnings,
            'force_warnings' => $forceWarnings,
            'blockers' => $this->blockers($product, force: false),
            'force_blockers' => $this->blockers($product, force: true),
        ];
    }

    /**
     * Mensajes de bloqueo, en el mismo orden (y con el mismo texto) que siempre
     * devolvió el DELETE: apartados → componente de paquete → paquete armado.
     *
     * @return list<string>
     */
    public function blockers(Product $product, bool $force): array
    {
        $blockers = [];

        if (! $force) {
            $n = $this->layawaysCount($product);
            if ($n > 0) {
                $label = $product->product_type === Product::TYPE_MANGA ? 'tomo' : 'producto';
                $blockers[] = "No se puede eliminar: el {$label} tiene {$n} apartado(s). Puedes desactivarlo.";
            }
        }

        try {
            $this->bundles->assertNotComponent($product);
        } catch (DomainException $e) {
            $blockers[] = $e->getMessage();
        }

        // Mismo candado que BundleService::delete (2026-10-08): bloquea cualquier
        // fila de inventory ≠ 0, no la suma (+2 en una tienda y −2 en otra bloquea).
        if ($product->isBundle() && $this->bundles->hasStock($product)) {
            $blockers[] = 'No se puede eliminar: el paquete tiene inventario (armados o un ajuste negativo). Desármalo o corrígelo desde Paquetes.';
        }

        return $blockers;
    }

    /**
     * Borra el producto (o tomo). `force` = también sus apartados (solo admin,
     * lo gatea el controller). Devuelve cuántas ventas quedan en historial y un
     * `audit` compacto (stock por tienda que se perdió) para el system_log.
     *
     * @param  array<string, int|float|null>|null  $expected  Conteos que el usuario vio en la vista previa.
     * @return array{sales_kept: int, audit: array<string, mixed>}
     * @throws DomainException si hay bloqueos o el producto cambió (→ 422)
     */
    public function delete(Product $product, User $user, bool $force, ?array $expected): array
    {
        $imagePaths = [];

        $result = DB::transaction(function () use ($product, $user, $force, $expected, &$imagePaths) {
            $locked = Product::query()->lockForUpdate()->findOrFail($product->id);

            $blockers = $this->blockers($locked, $force);
            if ($blockers !== []) {
                throw new DomainException($blockers[0]);
            }
            $this->assertUnchanged($locked, $expected);

            $stock = $this->stockByStore($locked, $user);
            $audit = [
                'stock_total' => $stock['total'],
                'stores' => $stock['stores'],
                'transfers_pending' => $this->pendingTransfers($locked),
                'layaways_deleted' => $force ? $this->layawaysCount($locked) : 0,
            ];

            $imagePaths = $locked->images->pluck('image_path')->filter()->values()->all();

            if ($force) {
                DB::table('layaways')->where('product_id', $locked->id)->delete();
            }

            return ['sales_kept' => ProductController::snapshotAndDelete($locked), 'audit' => $audit];
        });

        // Archivos fuera de la transacción: si la BD falla, las imágenes siguen.
        foreach ($imagePaths as $path) {
            Storage::delete($path);
        }

        return $result;
    }

    /** @param array<string, int|float|null>|null $expected */
    private function assertUnchanged(Product $product, ?array $expected): void
    {
        if ($expected === null || $expected === []) {
            return;
        }

        $current = [
            'stock_total' => (float) DB::table('inventory')->where('product_id', $product->id)->sum('quantity'),
            'layaways' => $this->layawaysCount($product),
            'transfers_pending' => $this->pendingTransfers($product),
        ];

        foreach ($current as $key => $value) {
            if (! array_key_exists($key, $expected) || $expected[$key] === null) {
                continue;
            }
            if (abs((float) $expected[$key] - (float) $value) > 0.005) {
                throw new DomainException('El producto cambió mientras revisabas (stock, apartados o traslados). Vuelve a abrir la vista previa.');
            }
        }
    }

    /**
     * Stock agrupado por tienda y tipo de almacén en UNA query (SQLite y
     * Postgres: todas las columnas no agregadas van en el GROUP BY; el SUM
     * llega como string en Postgres → cast). La tienda del usuario va primero.
     *
     * @return array{total: float, central: float, stores: list<array<string, mixed>>}
     */
    private function stockByStore(Product $product, User $user): array
    {
        $rows = DB::table('inventory as i')
            ->join('warehouses as w', 'w.id', '=', 'i.warehouse_id')
            ->leftJoin('stores as s', 's.id', '=', 'w.store_id')
            ->where('i.product_id', $product->id)
            ->groupBy('w.store_id', 's.name', 'w.type')
            ->get(['w.store_id', 's.name as store_name', 'w.type', DB::raw('SUM(i.quantity) as qty')]);

        $stores = [];
        $central = 0.0;
        $total = 0.0;
        $myStoreId = (int) ($user->store_id ?? 0);

        foreach ($rows as $row) {
            $qty = (float) $row->qty;
            $total += $qty;
            if ($row->store_id === null || $row->type === 'central') {
                $central += $qty;
                continue;
            }
            $storeId = (int) $row->store_id;
            $stores[$storeId] ??= [
                'store_id' => $storeId,
                'store_name' => (string) ($row->store_name ?? "Tienda #{$storeId}"),
                'is_mine' => $storeId === $myStoreId,
                'exhibicion' => 0.0,
                'bodega' => 0.0,
                'total' => 0.0,
            ];
            $key = $row->type === 'bodega' ? 'bodega' : 'exhibicion';
            $stores[$storeId][$key] += $qty;
            $stores[$storeId]['total'] += $qty;
        }

        $list = array_values(array_filter($stores, fn (array $s) => abs($s['total']) > 0.004));
        usort($list, function (array $a, array $b): int {
            if ($a['is_mine'] !== $b['is_mine']) {
                return $a['is_mine'] ? -1 : 1;
            }

            return strcasecmp($a['store_name'], $b['store_name']);
        });

        return ['total' => round($total, 2), 'central' => round($central, 2), 'stores' => $list];
    }

    private function layawaysCount(Product $product): int
    {
        return DB::table('layaways')->where('product_id', $product->id)->count();
    }

    /** Traslados aún pendientes que traen una línea de este producto (la línea se iría en cascade). */
    private function pendingTransfers(Product $product): int
    {
        return DB::table('transfer_items as ti')
            ->join('transfers as t', 't.id', '=', 'ti.transfer_id')
            ->where('ti.product_id', $product->id)
            ->where('t.status', Transfer::STATUS_PENDING)
            ->distinct()
            ->count('t.id');
    }

    /** Artículos de folios abiertos que apuntan al producto directo o vía su catálogo de preventa. */
    private function openPreSaleItems(Product $product): int
    {
        return DB::table('pre_sale_order_items as it')
            ->join('pre_sale_orders as o', 'o.id', '=', 'it.pre_sale_order_id')
            ->whereIn('o.status', PreSaleOrder::OPEN_STATUSES)
            ->where(function ($q) use ($product) {
                $q->where('it.product_id', $product->id)
                    ->orWhereIn('it.pre_sale_catalog_id', DB::table('pre_sale_catalogs')->where('product_id', $product->id)->select('id'));
            })
            ->count();
    }

    private static function fmtQty(float $n): string
    {
        return abs($n - round($n)) < 0.005 ? (string) (int) round($n) : number_format($n, 2, '.', '');
    }
}
