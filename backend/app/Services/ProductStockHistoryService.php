<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Inventory;
use App\Models\InventoryMovement;
use App\Models\Product;
use App\Support\DateRange;
use Illuminate\Contracts\Pagination\LengthAwarePaginator;
use Illuminate\Database\Eloquent\Builder;

/**
 * Historial de stock de UN producto (2026-11-19, pedido de Tadaima Tijuana).
 * Módulo aparte a propósito: `GET /inventory/movements` queda como estaba
 * (lo usa la app móvil). Aquí: movimientos paginados (más nuevo primero) y el
 * stock actual por almacén, ambos limitados a la misma tienda/almacén, para que
 * el front reconstruya el saldo hacia atrás (`landing/src/lib/stockHistory.ts`).
 *
 * El alcance por tienda (quién puede pedir qué) lo decide el controller; este
 * servicio solo aplica los filtros que recibe.
 */
class ProductStockHistoryService
{
    public const DEFAULT_PER_PAGE = 100;

    public const MAX_PER_PAGE = 500;

    /**
     * @param  ?int  $storeId  null = todas las tiendas (solo admin llega así)
     * @param  ?string  $from  YYYY-MM-DD, día de negocio (America/Tijuana)
     * @param  ?string  $to  YYYY-MM-DD, día de negocio (America/Tijuana)
     */
    public function movements(
        Product $product,
        ?int $storeId,
        ?int $warehouseId,
        ?string $from,
        ?string $to,
        int $perPage,
        int $page,
    ): LengthAwarePaginator {
        $fromUtc = DateRange::fromUtc($from);
        $toUtc   = DateRange::toUtc($to);

        return InventoryMovement::query()
            ->with(['warehouse.store', 'user:id,name'])
            ->where('product_id', $product->id)
            ->when($warehouseId !== null, fn (Builder $q) => $q->where('warehouse_id', $warehouseId))
            ->when($storeId !== null, fn (Builder $q) => $q->whereHas('warehouse', fn (Builder $w) => $w->where('store_id', $storeId)))
            ->when($fromUtc !== null, fn (Builder $q) => $q->where('created_at', '>=', $fromUtc))
            ->when($toUtc !== null, fn (Builder $q) => $q->where('created_at', '<=', $toUtc))
            // id como desempate: un traslado deja dos renglones con la misma hora.
            ->orderByDesc('created_at')
            ->orderByDesc('id')
            ->paginate(min(max($perPage, 1), self::MAX_PER_PAGE), ['*'], 'page', max($page, 1));
    }

    /**
     * Stock actual del producto por almacén, con los mismos filtros de tienda y
     * almacén que los movimientos.
     *
     * @return list<array{warehouse_id:int, warehouse_name:?string, warehouse_type:?string, store_id:?int, store_name:?string, quantity:float}>
     */
    public function currentStock(Product $product, ?int $storeId, ?int $warehouseId): array
    {
        return Inventory::query()
            ->with('warehouse.store')
            ->where('product_id', $product->id)
            ->when($warehouseId !== null, fn (Builder $q) => $q->where('warehouse_id', $warehouseId))
            ->when($storeId !== null, fn (Builder $q) => $q->whereHas('warehouse', fn (Builder $w) => $w->where('store_id', $storeId)))
            ->orderBy('warehouse_id')
            ->get()
            ->map(fn (Inventory $inv): array => [
                'warehouse_id'   => (int) $inv->warehouse_id,
                'warehouse_name' => $inv->warehouse?->name,
                'warehouse_type' => $inv->warehouse?->type,
                'store_id'       => $inv->warehouse?->store_id !== null ? (int) $inv->warehouse->store_id : null,
                'store_name'     => $inv->warehouse?->store?->name,
                'quantity'       => (float) $inv->quantity,
            ])
            ->values()
            ->all();
    }
}
