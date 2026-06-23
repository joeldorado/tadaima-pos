<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\MoveInventoryRequest;
use App\Http\Requests\StoreInventoryMovementRequest;
use App\Http\Requests\UpdateInventoryRequest;
use App\Http\Resources\InventoryMovementResource;
use App\Http\Resources\InventoryResource;
use App\Models\Inventory;
use App\Models\InventoryMovement;
use App\Models\SystemLog;
use App\Models\Warehouse;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class InventoryController extends Controller
{
    /**
     * GET /inventory
     *
     * Query params opcionales:
     *   ?product_id=1
     *   ?warehouse_id=2
     */
    public function index(Request $request): JsonResponse
    {
        $inventory = Inventory::query()
            ->with(['product', 'warehouse.store'])
            ->when($request->filled('product_id'),   fn ($q) => $q->forProduct($request->product_id))
            ->when($request->filled('warehouse_id'), fn ($q) => $q->forWarehouse($request->warehouse_id))
            ->orderBy('product_id')
            ->get();

        return $this->success(InventoryResource::collection($inventory));
    }

    /**
     * PUT /inventory/{productId}/{warehouseId}
     *
     * Establece el stock absoluto de un producto en una bodega.
     * Siempre genera un movimiento de tipo 'ajuste' para mantener trazabilidad.
     *
     * Body: { quantity: float, notes?: string, user_id: int }
     */
    public function update(UpdateInventoryRequest $request, int $productId, int $warehouseId): JsonResponse
    {
        // Guard cross-tienda: gerente/cajero solo ajustan bodegas de SU tienda.
        $warehouse = Warehouse::find($warehouseId);
        if (! $warehouse) {
            return $this->error('Bodega no encontrada.', 404);
        }
        if ($resp = $this->storeScopeError($request, $warehouse->store_id)) {
            return $resp;
        }

        $newQty = (float) $request->quantity;

        [$record, $oldQty, $delta] = DB::transaction(function () use ($request, $productId, $warehouseId, $newQty) {
            // Obtener o crear el registro de inventario
            $inventory = Inventory::firstOrCreate(
                ['product_id' => $productId, 'warehouse_id' => $warehouseId],
                ['quantity'   => 0]
            );

            $oldQty = (float) $inventory->quantity;
            $delta  = $newQty - $oldQty;

            // Registrar ajuste (incluso si delta = 0, para dejar evidencia del intento)
            InventoryMovement::create([
                'product_id'   => $productId,
                'warehouse_id' => $warehouseId,
                'type'         => 'ajuste',
                'quantity'     => $delta,
                'notes'        => $request->notes ?? "Ajuste manual: {$inventory->quantity} → {$newQty}",
                'user_id'      => $request->user()->id,
            ]);

            $inventory->update(['quantity' => $newQty]);

            return [$inventory->load(['product', 'warehouse']), $oldQty, $delta];
        });

        // Log de auditoría — solo si la cantidad cambió realmente. El movimiento
        // queda igualmente en `inventory_movements` para trazabilidad operativa.
        if (abs($delta) > 0.0001) {
            $productName   = $record->product?->name   ?? "Producto #{$productId}";
            $warehouseName = $record->warehouse?->name ?? "Bodega #{$warehouseId}";
            SystemLog::write(
                action: 'inventory.adjusted',
                description: "Stock ajustado: {$productName} en {$warehouseName}: {$oldQty} → {$newQty}",
                entityType: 'inventory',
                entityId: $productId,
                meta: [
                    'product_id'   => $productId,
                    'warehouse_id' => $warehouseId,
                    'old'          => $oldQty,
                    'new'          => $newQty,
                    'delta'        => $delta,
                ],
            );
        }

        return $this->success(new InventoryResource($record), 'Stock actualizado');
    }

    /**
     * POST /inventory/movements
     *
     * Registra un movimiento y actualiza el stock automáticamente.
     * Rechaza movimientos que resultarían en stock negativo.
     *
     * Body:
     * {
     *   product_id, warehouse_id, type, quantity,
     *   reference?, notes?, user_id
     * }
     */
    public function storeMovement(StoreInventoryMovementRequest $request): JsonResponse
    {
        // Guard cross-tienda: solo se aceptan movimientos sobre bodegas de la
        // tienda del usuario (admin: cualquiera).
        $warehouse = Warehouse::find($request->warehouse_id);
        if (! $warehouse) {
            return $this->error('Bodega no encontrada.', 404);
        }
        if ($resp = $this->storeScopeError($request, $warehouse->store_id)) {
            return $resp;
        }

        try {
            $movement = DB::transaction(function () use ($request) {
            // Obtener inventario actual (lock para escritura concurrente)
            $inventory = Inventory::lockForUpdate()->firstOrCreate(
                [
                    'product_id'   => $request->product_id,
                    'warehouse_id' => $request->warehouse_id,
                ],
                ['quantity' => 0]
            );

            // Calcular el movimiento sin persistirlo todavía
            $pending = new InventoryMovement(array_merge(
                $request->only(['product_id', 'warehouse_id', 'type', 'quantity', 'reference', 'notes']),
                ['user_id' => $request->user()->id],
            ));

            $delta    = $pending->stockDelta();
            $newStock = $inventory->quantity + $delta;

            // ── Regla: no permitir stock negativo ─────────────────────────────
            if ($newStock < 0) {
                throw new \DomainException(
                    "Stock insuficiente. Disponible: {$inventory->quantity}, requerido: " . abs($delta)
                );
            }

            // Persistir movimiento primero (trazabilidad garantizada)
            $movement = InventoryMovement::create($pending->getAttributes());

            // Actualizar stock
            $inventory->update(['quantity' => $newStock]);

            return $movement->load(['product', 'warehouse', 'user']);
        });

        } catch (\DomainException $e) {
            return $this->error($e->getMessage(), 422);
        }

        return $this->success(
            new InventoryMovementResource($movement),
            'Movimiento registrado',
            201
        );
    }

    /**
     * POST /inventory/move
     *
     * Mueve stock de un producto entre dos almacenes de LA MISMA tienda
     * (Exhibición ↔ Bodega). Registra dos InventoryMovement tipo 'transferencia'
     * (negativo en origen, positivo en destino). No mueve entre tiendas distintas
     * — eso es Traslados (`/transfers`).
     *
     * Body: { product_id, from_warehouse_id, to_warehouse_id, quantity, notes? }
     */
    public function move(MoveInventoryRequest $request): JsonResponse
    {
        $from = Warehouse::find($request->from_warehouse_id);
        $to   = Warehouse::find($request->to_warehouse_id);
        if (! $from || ! $to) {
            return $this->error('Almacén no encontrado.', 404);
        }

        // Solo entre almacenes de la MISMA tienda (Exhibición ↔ Bodega).
        if ($from->store_id === null || $from->store_id !== $to->store_id) {
            return $this->error('Solo se puede mover stock entre almacenes de la misma tienda. Para mover entre tiendas usa Traslados.', 422);
        }

        // Guard cross-tienda: gerente/cajero solo mueven dentro de su tienda.
        if ($resp = $this->storeScopeError($request, $from->store_id)) {
            return $resp;
        }

        $qty = (float) $request->quantity;

        try {
            $result = DB::transaction(function () use ($request, $from, $to, $qty) {
                // Lock del origen para evitar sobre-giro concurrente.
                $source = Inventory::lockForUpdate()->firstOrCreate(
                    ['product_id' => $request->product_id, 'warehouse_id' => $from->id],
                    ['quantity' => 0],
                );

                if ((float) $source->quantity < $qty) {
                    throw new \DomainException(
                        "Stock insuficiente en {$from->name}. Disponible: {$source->quantity}, a mover: {$qty}."
                    );
                }

                $dest = Inventory::lockForUpdate()->firstOrCreate(
                    ['product_id' => $request->product_id, 'warehouse_id' => $to->id],
                    ['quantity' => 0],
                );

                $source->decrement('quantity', $qty);
                $dest->increment('quantity', $qty);

                $ref = "MOV-{$from->id}->{$to->id}";
                InventoryMovement::create([
                    'product_id'   => $request->product_id,
                    'warehouse_id' => $from->id,
                    'type'         => 'transferencia',
                    'quantity'     => -$qty,
                    'reference'    => $ref,
                    'notes'        => $request->notes ?? "Mover a {$to->name}",
                    'user_id'      => $request->user()->id,
                ]);
                InventoryMovement::create([
                    'product_id'   => $request->product_id,
                    'warehouse_id' => $to->id,
                    'type'         => 'transferencia',
                    'quantity'     => $qty,
                    'reference'    => $ref,
                    'notes'        => $request->notes ?? "Desde {$from->name}",
                    'user_id'      => $request->user()->id,
                ]);

                return $dest->fresh()->load(['product', 'warehouse.store']);
            });
        } catch (\DomainException $e) {
            return $this->error($e->getMessage(), 422);
        }

        return $this->success(new InventoryResource($result), 'Stock movido.');
    }

    /**
     * GET /inventory/movements
     *
     * Query params opcionales:
     *   ?product_id=
     *   ?warehouse_id=
     *   ?type=entrada|venta|ajuste|...
     *   ?from=2026-01-01
     *   ?to=2026-12-31
     *   ?per_page=50
     */
    public function movements(Request $request): JsonResponse
    {
        $perPage = (int) $request->get('per_page', 50);

        $query = InventoryMovement::query()
            ->with(['product', 'warehouse', 'user'])
            ->when($request->filled('product_id'),   fn ($q) => $q->where('product_id',   $request->product_id))
            ->when($request->filled('warehouse_id'), fn ($q) => $q->where('warehouse_id', $request->warehouse_id))
            ->when($request->filled('type'),         fn ($q) => $q->where('type',         $request->type))
            ->when($request->filled('from'),         fn ($q) => $q->whereDate('created_at', '>=', $request->from))
            ->when($request->filled('to'),           fn ($q) => $q->whereDate('created_at', '<=', $request->to))
            ->latest('created_at');

        $results = $perPage > 0 ? $query->paginate($perPage) : $query->get();

        return $this->success(
            InventoryMovementResource::collection($perPage > 0 ? $results->items() : $results)
        );
    }
}
