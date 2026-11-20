<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\InventoryMovement;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Renglón del Historial de stock (GET /products/{product}/stock-history).
 * Distinto de InventoryMovementResource a propósito: ese lo usa la app móvil
 * y no cambia. Sin costos.
 *
 * @mixin InventoryMovement
 */
class StockHistoryMovementResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        /** @var InventoryMovement $movement */
        $movement  = $this->resource;
        $warehouse = $movement->warehouse;

        return [
            'id'           => $movement->id,
            'type'         => $movement->type,
            'quantity'     => $movement->quantity,
            // Cambio real al stock con signo: en ventas y apartados `quantity` viene positivo.
            'stock_delta'  => $movement->stockDelta(),
            'reference'    => $movement->reference,
            'notes'        => $movement->notes,
            'warehouse_id' => $movement->warehouse_id,
            'warehouse'    => $warehouse ? [
                'id'         => $warehouse->id,
                'name'       => $warehouse->name,
                'type'       => $warehouse->type,
                'store_id'   => $warehouse->store_id,
                'store_name' => $warehouse->store?->name,
            ] : null,
            'user'         => $movement->user ? [
                'id'   => $movement->user->id,
                'name' => $movement->user->name,
            ] : null,
            'created_at'   => $movement->created_at?->toISOString(),
        ];
    }
}
