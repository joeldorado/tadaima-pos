<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\ProductStockHistoryRequest;
use App\Http\Resources\StockHistoryMovementResource;
use App\Models\Product;
use App\Models\User;
use App\Models\Warehouse;
use App\Services\ProductStockHistoryService;
use Illuminate\Http\JsonResponse;

/**
 * Historial de stock de un producto o tomo (2026-11-19). Pantalla: botón
 * «Historial» en Productos y en Existencias por Tienda.
 *
 * Alcance: gerente y cajero solo su tienda (sin `store_id` se usa la suya;
 * otra tienda o un almacén de otra tienda → 403). El admin elige tienda o ve
 * todas.
 */
class ProductStockHistoryController extends Controller
{
    public function __construct(private readonly ProductStockHistoryService $history)
    {
    }

    /** GET /products/{product}/stock-history */
    public function show(ProductStockHistoryRequest $request, Product $product): JsonResponse
    {
        $user = $request->user();

        $warehouseId = $request->filled('warehouse_id') ? $request->integer('warehouse_id') : null;
        if ($warehouseId !== null) {
            $warehouseStoreId = Warehouse::query()->whereKey($warehouseId)->value('store_id');
            if ($resp = $this->storeScopeError($request, $warehouseStoreId)) {
                return $resp;
            }
        }

        $storeId = $request->filled('store_id') ? $request->integer('store_id') : null;
        if ($storeId === null && $user instanceof User && ! $user->isAdminRole()) {
            $storeId = $user->store_id !== null ? (int) $user->store_id : null;
        }
        // Admin sin tienda = todas; cualquier otro necesita una tienda que sea la suya.
        if (! ($storeId === null && $user instanceof User && $user->isAdminRole())) {
            if ($resp = $this->storeScopeError($request, $storeId)) {
                return $resp;
            }
        }

        $page = $this->history->movements(
            $product,
            $storeId,
            $warehouseId,
            $request->input('from'),
            $request->input('to'),
            $request->integer('per_page', ProductStockHistoryService::DEFAULT_PER_PAGE),
            $request->integer('page', 1),
        );

        return $this->success([
            'data'          => StockHistoryMovementResource::collection($page->items()),
            'pagination'    => [
                'total'        => $page->total(),
                'per_page'     => $page->perPage(),
                'current_page' => $page->currentPage(),
                'last_page'    => $page->lastPage(),
            ],
            'current_stock' => $this->history->currentStock($product, $storeId, $warehouseId),
        ]);
    }
}
