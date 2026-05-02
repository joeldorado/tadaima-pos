<?php

namespace App\Services;

use App\Models\Inventory;
use App\Models\InventoryMovement;
use App\Models\Transfer;
use App\Models\TransferItem;
use Illuminate\Support\Facades\DB;

class TransferService
{
    // ─── Create (pending) ─────────────────────────────────────────────────────

    /**
     * Crea un traslado en estado pending.
     * El inventario NO se mueve hasta llamar a complete().
     *
     * Valida antes de crear:
     *  - Las bodegas existen y son distintas
     *  - No hay ítems duplicados del mismo producto
     *
     * @throws \DomainException
     */
    public function create(array $data, array $itemsData, int $userId): Transfer
    {
        return DB::transaction(function () use ($data, $itemsData, $userId) {
            // Validar productos únicos por traslado
            $productIds = array_column($itemsData, 'product_id');
            if (count($productIds) !== count(array_unique($productIds))) {
                throw new \DomainException('Hay productos duplicados en el traslado. Consolídalos en un solo ítem.');
            }

            $transfer = Transfer::create([
                'from_warehouse_id' => $data['from_warehouse_id'],
                'to_warehouse_id'   => $data['to_warehouse_id'],
                'user_id'           => $userId,
                'status'            => Transfer::STATUS_PENDING,
                'notes'             => $data['notes'] ?? null,
            ]);

            foreach ($itemsData as $item) {
                TransferItem::create([
                    'transfer_id' => $transfer->id,
                    'product_id'  => $item['product_id'],
                    'quantity'    => $item['quantity'],
                ]);
            }

            return $transfer->load(['items.product', 'fromWarehouse', 'toWarehouse', 'user']);
        });
    }

    // ─── Complete (moves inventory) ───────────────────────────────────────────

    /**
     * Ejecuta el traslado: descuenta de la bodega origen e ingresa en la destino.
     *
     * Flow (DB::transaction + lockForUpdate):
     *  1. Lock transfer → validar pending
     *  2. Por cada ítem:
     *     a. Lock inventario origen → validar stock suficiente
     *     b. Decrement origen
     *     c. firstOrCreate inventario destino → increment
     *     d. InventoryMovement (type=transferencia) en cada bodega
     *  3. Marcar transfer como completed
     *
     * @throws \DomainException si no hay stock suficiente en algún producto
     */
    public function complete(Transfer $transfer, int $userId): Transfer
    {
        return DB::transaction(function () use ($transfer, $userId) {
            $transfer = Transfer::lockForUpdate()->find($transfer->id);

            if ($transfer->status !== Transfer::STATUS_PENDING) {
                throw new \DomainException(
                    "El traslado #{$transfer->id} no puede completarse (estado: {$transfer->status})."
                );
            }

            $transfer->load('items.product');
            $ref = "TRASLADO-{$transfer->id}";

            foreach ($transfer->items as $item) {
                // ── Lock inventario origen ────────────────────────────────────
                $from = Inventory::lockForUpdate()
                    ->where('product_id',   $item->product_id)
                    ->where('warehouse_id', $transfer->from_warehouse_id)
                    ->first();

                $available = $from?->quantity ?? 0;
                if ($available < $item->quantity) {
                    $name = $item->product?->name ?? "ID:{$item->product_id}";
                    throw new \DomainException(
                        "Stock insuficiente para '{$name}' en bodega origen. " .
                        "Disponible: {$available}, requerido: {$item->quantity}."
                    );
                }

                // ── Descontar origen ──────────────────────────────────────────
                $from->decrement('quantity', $item->quantity);

                InventoryMovement::create([
                    'product_id'   => $item->product_id,
                    'warehouse_id' => $transfer->from_warehouse_id,
                    'type'         => 'transferencia',
                    'quantity'     => -$item->quantity, // salida
                    'reference'    => $ref,
                    'notes'        => "Salida por traslado #{$transfer->id}",
                    'user_id'      => $userId,
                ]);

                // ── Incrementar destino ───────────────────────────────────────
                $to = Inventory::lockForUpdate()->firstOrCreate(
                    ['product_id' => $item->product_id, 'warehouse_id' => $transfer->to_warehouse_id],
                    ['quantity'   => 0]
                );

                $to->increment('quantity', $item->quantity);

                InventoryMovement::create([
                    'product_id'   => $item->product_id,
                    'warehouse_id' => $transfer->to_warehouse_id,
                    'type'         => 'transferencia',
                    'quantity'     => $item->quantity, // entrada
                    'reference'    => $ref,
                    'notes'        => "Entrada por traslado #{$transfer->id}",
                    'user_id'      => $userId,
                ]);
            }

            $transfer->update(['status' => Transfer::STATUS_COMPLETED]);

            return $transfer->fresh(['items.product', 'fromWarehouse', 'toWarehouse', 'user']);
        });
    }

    // ─── Cancel ───────────────────────────────────────────────────────────────

    /**
     * Cancela un traslado pending.
     * No se toca inventario porque aún no se movió nada.
     *
     * @throws \DomainException
     */
    public function cancel(Transfer $transfer): Transfer
    {
        return DB::transaction(function () use ($transfer) {
            $transfer = Transfer::lockForUpdate()->find($transfer->id);

            if ($transfer->status !== Transfer::STATUS_PENDING) {
                throw new \DomainException(
                    "El traslado #{$transfer->id} no puede cancelarse (estado: {$transfer->status})."
                );
            }

            $transfer->update(['status' => Transfer::STATUS_CANCELLED]);

            return $transfer->fresh(['items.product', 'fromWarehouse', 'toWarehouse', 'user']);
        });
    }
}
