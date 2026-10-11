<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Inventory;
use App\Models\Product;
use App\Models\ProductBundleItem;
use App\Models\Store;
use App\Models\User;
use App\Models\Warehouse;
use Illuminate\Support\Collection;

/**
 * Paquetes (2026-10-07): "¿cuántos puedo armar?" por tienda.
 *
 * max_buildable = min_i floor((exh_i + bod_i) / qty_i) — escenario Automático
 * (Exhibición primero, lo que falte de Bodega). Lee las MISMAS filas de
 * `inventory` que BundleService::assemble (Exhibición = primer
 * warehouses.type='store' activo por id; Bodega = primer type='bodega'), así el
 * número que ve el usuario es exactamente el que el armado acepta. Un stock
 * NEGATIVO de un componente (ajuste viejo) cuenta como 0 y así se reporta en
 * `stock_exhibicion`/`stock_bodega` (2026-10-08): la UI suma esos campos y
 * `assemble` tampoco "presta" piezas de una fila negativa.
 */
final class BundleAvailability
{
    /**
     * Tiendas sobre las que el usuario puede consultar/armar: admin → la pedida
     * o todas las activas; gerente/cajero → solo la suya (vacío si no tiene).
     *
     * @return list<int>
     */
    public static function allowedStoreIds(User $user, ?int $requestedStoreId): array
    {
        if ($user->isAdminRole()) {
            if ($requestedStoreId) {
                return [$requestedStoreId];
            }

            return Store::query()->where('active', true)->orderBy('name')->pluck('id')->map(fn ($id) => (int) $id)->all();
        }

        if ($user->store_id === null) {
            return [];
        }

        if ($requestedStoreId && (int) $requestedStoreId !== (int) $user->store_id) {
            return [];
        }

        return [(int) $user->store_id];
    }

    /**
     * Disponibilidad por tienda de UN paquete (componentes desde la BD).
     *
     * @param list<int> $storeIds
     * @return list<array<string,mixed>>
     */
    public function availabilityFor(Product $bundle, array $storeIds): array
    {
        $components = $this->componentRows($bundle);

        return $this->availabilityForComponents($components, $storeIds, $bundle->id);
    }

    /**
     * Disponibilidad de VARIOS paquetes en una sola pasada (listado).
     *
     * @param Collection<int, Product> $bundles  con `bundleItems.component` cargados
     * @param list<int> $storeIds
     * @return array<int, list<array<string,mixed>>>  bundle_id => filas por tienda
     */
    public function availabilityForMany(Collection $bundles, array $storeIds): array
    {
        if ($bundles->isEmpty()) {
            return [];
        }
        $stores = $this->storesWithWarehouses($storeIds);
        $warehouseIds = $stores->flatMap(fn (array $s) => array_filter([$s['exh']?->id, $s['bod']?->id]))->values()->all();

        $productIds = $bundles->flatMap(fn (Product $b) => $b->bundleItems->pluck('component_product_id'))
            ->merge($bundles->pluck('id'))
            ->unique()
            ->values()
            ->all();
        $stockMap = $this->stockMap($productIds, $warehouseIds);

        $out = [];
        foreach ($bundles as $bundle) {
            $components = $bundle->bundleItems->map(fn (ProductBundleItem $i) => [
                'product_id' => (int) $i->component_product_id,
                'name' => $i->component?->name ?? "Producto #{$i->component_product_id}",
                'sku' => $i->component?->sku ?? '',
                'quantity' => (int) $i->quantity,
            ])->values()->all();
            $out[$bundle->id] = $this->buildAvailability($components, $stores, $stockMap, $bundle->id);
        }

        return $out;
    }

    /**
     * Disponibilidad para una composición arbitraria (preview del asistente) o
     * para un paquete concreto ($bundleProductId trae también su stock).
     *
     * @param list<array{product_id:int,quantity:int,name?:string,sku?:string}> $components
     * @param list<int> $storeIds
     * @return list<array<string,mixed>>
     */
    public function availabilityForComponents(array $components, array $storeIds, ?int $bundleProductId = null): array
    {
        $components = $this->hydrateComponentNames($components);
        $stores = $this->storesWithWarehouses($storeIds);
        $warehouseIds = $stores->flatMap(fn (array $s) => array_filter([$s['exh']?->id, $s['bod']?->id]))->values()->all();
        $productIds = array_values(array_unique(array_filter(array_merge(array_column($components, 'product_id'), [$bundleProductId]))));
        $stockMap = $this->stockMap($productIds, $warehouseIds);

        return $this->buildAvailability($components, $stores, $stockMap, $bundleProductId);
    }

    /**
     * Cuántos paquetes salen con el stock dado (escenario Automático).
     *
     * @param list<array{product_id:int,quantity:int}> $components
     * @param array<int,float|int> $stockByProduct
     */
    public static function maxBuildable(array $components, array $stockByProduct): int
    {
        if ($components === []) {
            return 0;
        }
        $max = PHP_INT_MAX;
        foreach ($components as $c) {
            $qty = (int) $c['quantity'];
            if ($qty <= 0) {
                return 0;
            }
            $stock = (float) ($stockByProduct[(int) $c['product_id']] ?? 0);
            $max = min($max, (int) floor($stock / $qty));
        }

        return max(0, $max);
    }

    // ─── Privados ─────────────────────────────────────────────────────────────

    /** @return list<array{product_id:int,quantity:int,name:string,sku:string}> */
    private function componentRows(Product $bundle): array
    {
        return ProductBundleItem::query()
            ->where('bundle_product_id', $bundle->id)
            ->with('component:id,name,sku')
            ->orderBy('position')
            ->orderBy('id')
            ->get()
            ->map(fn (ProductBundleItem $i) => [
                'product_id' => (int) $i->component_product_id,
                'quantity' => (int) $i->quantity,
                'name' => $i->component?->name ?? "Producto #{$i->component_product_id}",
                'sku' => $i->component?->sku ?? '',
            ])
            ->values()
            ->all();
    }

    /**
     * @param list<array{product_id:int,quantity:int,name?:string,sku?:string}> $components
     * @return list<array{product_id:int,quantity:int,name:string,sku:string}>
     */
    private function hydrateComponentNames(array $components): array
    {
        $missing = array_values(array_unique(array_map(
            fn (array $c) => (int) $c['product_id'],
            array_filter($components, fn (array $c) => ! isset($c['name'])),
        )));
        $names = $missing === []
            ? collect()
            : Product::query()->whereIn('id', $missing)->get(['id', 'name', 'sku'])->keyBy('id');

        return array_values(array_map(function (array $c) use ($names) {
            $pid = (int) $c['product_id'];

            return [
                'product_id' => $pid,
                'quantity' => (int) $c['quantity'],
                'name' => $c['name'] ?? ($names->get($pid)?->name ?? "Producto #{$pid}"),
                'sku' => $c['sku'] ?? ($names->get($pid)?->sku ?? ''),
            ];
        }, $components));
    }

    /**
     * @param list<int> $storeIds
     * @return Collection<int, array{store:Store, exh:?Warehouse, bod:?Warehouse}>
     */
    private function storesWithWarehouses(array $storeIds): Collection
    {
        if ($storeIds === []) {
            return collect();
        }

        return Store::query()
            ->whereIn('id', $storeIds)
            ->where('active', true)
            ->with(['warehouses' => fn ($q) => $q->where('active', true)->orderBy('id')])
            ->orderBy('name')
            ->get()
            ->map(fn (Store $store) => [
                'store' => $store,
                'exh' => $store->warehouses->firstWhere('type', 'store'),
                'bod' => $store->warehouses->firstWhere('type', 'bodega'),
            ]);
    }

    /**
     * @param list<int> $productIds
     * @param list<int> $warehouseIds
     * @return array<int, array<int, float>>  warehouse_id => product_id => qty
     */
    private function stockMap(array $productIds, array $warehouseIds): array
    {
        if ($productIds === [] || $warehouseIds === []) {
            return [];
        }
        $map = [];
        $rows = Inventory::query()
            ->whereIn('product_id', $productIds)
            ->whereIn('warehouse_id', $warehouseIds)
            ->get(['product_id', 'warehouse_id', 'quantity']);
        foreach ($rows as $row) {
            $map[(int) $row->warehouse_id][(int) $row->product_id] = (float) $row->quantity;
        }

        return $map;
    }

    /**
     * @param list<array{product_id:int,quantity:int,name:string,sku:string}> $components
     * @param Collection<int, array{store:Store, exh:?Warehouse, bod:?Warehouse}> $stores
     * @param array<int, array<int, float>> $stockMap
     * @return list<array<string,mixed>>
     */
    private function buildAvailability(array $components, Collection $stores, array $stockMap, ?int $bundleProductId): array
    {
        $out = [];
        foreach ($stores as $entry) {
            /** @var Store $store */
            $store = $entry['store'];
            $exh = $entry['exh'];
            $bod = $entry['bod'];
            $exhStock = $exh ? ($stockMap[$exh->id] ?? []) : [];
            $bodStock = $bod ? ($stockMap[$bod->id] ?? []) : [];

            $rows = [];
            $combined = [];
            foreach ($components as $c) {
                $pid = $c['product_id'];
                $qty = max(1, $c['quantity']);
                // Igual que BundleService::assemble: una fila negativa no presta piezas.
                $e = max(0.0, (float) ($exhStock[$pid] ?? 0));
                $b = max(0.0, (float) ($bodStock[$pid] ?? 0));
                $combined[$pid] = $e + $b;
                $rows[] = [
                    'product_id' => $pid,
                    'name' => $c['name'],
                    'sku' => $c['sku'],
                    'quantity' => $c['quantity'],
                    'stock_exhibicion' => $e,
                    'stock_bodega' => $b,
                    'max_from_exhibicion' => (int) floor($e / $qty),
                    'max_from_combined' => (int) floor(($e + $b) / $qty),
                    'limiting' => false,
                ];
            }
            $max = $exh ? self::maxBuildable($components, $combined) : 0;
            foreach ($rows as &$row) {
                $row['limiting'] = $row['max_from_combined'] === $max;
            }
            unset($row);

            $out[] = [
                'store_id' => (int) $store->id,
                'store_name' => $store->name,
                'has_bodega' => $bod !== null,
                'stock_exhibicion' => $bundleProductId !== null ? (float) ($exhStock[$bundleProductId] ?? 0) : 0.0,
                'stock_bodega' => $bundleProductId !== null ? (float) ($bodStock[$bundleProductId] ?? 0) : 0.0,
                'max_buildable' => $max,
                'warning' => $exh ? null : 'Esta tienda no tiene almacén de Exhibición.',
                'components' => $rows,
            ];
        }

        return $out;
    }
}
