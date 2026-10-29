<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Inventory;
use App\Models\InventoryMovement;
use App\Models\SystemLog;
use Illuminate\Support\Facades\DB;

/**
 * Ajuste ABSOLUTO de stock (QuickStock, modal de editar producto, tomos):
 * fija la cantidad de un producto en una bodega y deja rastro en
 * `inventory_movements` (tipo `ajuste`) y en `system_logs` (`inventory.adjusted`).
 *
 * Única rutina para `PUT /inventory/{p}/{w}` y `PUT /manga-inventory/{p}/{w}`
 * (2026-10-29): antes los tomos no dejaban rastro y los ajustes "0 → 0" del
 * modal de editar producto (que manda TODOS los almacenes) generaban miles de
 * movimientos basura. Un ajuste sin cambio real NO escribe nada: la fila de
 * `inventory` se crea si no existía, pero no hay movimiento ni log.
 *
 * Los guards (scope de tienda, paquetes, tipo manga) viven en cada controller.
 */
class StockAdjustmentService
{
    /** Diferencias menores a esto se consideran "sin cambio" (misma tolerancia que el corte). */
    public const EPSILON = 0.0001;

    /**
     * @return array{inventory: Inventory, old: float, delta: float}
     */
    public function setAbsolute(int $productId, int $warehouseId, float $newQty, int $userId, ?string $notes = null): array
    {
        return DB::transaction(function () use ($productId, $warehouseId, $newQty, $userId, $notes): array {
            $inventory = Inventory::firstOrCreate(
                ['product_id' => $productId, 'warehouse_id' => $warehouseId],
                ['quantity' => 0],
            );

            $oldQty = (float) $inventory->quantity;
            $delta = $newQty - $oldQty;

            if (abs($delta) < self::EPSILON) {
                // Sin cambio real: ni movimiento ni log (ruido "0 → 0").
                return ['inventory' => $inventory, 'old' => $oldQty, 'delta' => 0.0];
            }

            InventoryMovement::create([
                'product_id'   => $productId,
                'warehouse_id' => $warehouseId,
                'type'         => 'ajuste',
                'quantity'     => $delta,
                'notes'        => $notes ?? "Ajuste manual: {$oldQty} → {$newQty}",
                'user_id'      => $userId,
            ]);

            $inventory->update(['quantity' => $newQty]);
            $inventory->load(['product', 'warehouse']);

            $productName   = $inventory->product?->name   ?? "Producto #{$productId}";
            $warehouseName = $inventory->warehouse?->name ?? "Bodega #{$warehouseId}";

            SystemLog::write(
                action: 'inventory.adjusted',
                description: "Stock ajustado: {$productName} en {$warehouseName}: {$oldQty} → {$newQty}",
                userId: $userId,
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

            return ['inventory' => $inventory, 'old' => $oldQty, 'delta' => $delta];
        });
    }
}
