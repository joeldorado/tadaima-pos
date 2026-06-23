<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Backfill idempotente: a cada tienda que ya tiene su almacén de Exhibición
 * (`type='store'`) pero NO tiene Bodega (`type='bodega'`), le crea la Bodega
 * en vacío (sin inventario). El stock existente se queda en Exhibición → todo
 * sigue vendible; mover a Bodega es una acción posterior y opcional.
 *
 * Corre sola en cada deploy (entrypoint `migrate --force`). Segura de re-correr.
 */
return new class extends Migration
{
    public function up(): void
    {
        $now    = now();
        $stores = DB::table('stores')->get(['id', 'company_id', 'name']);

        foreach ($stores as $store) {
            $hasBodega = DB::table('warehouses')
                ->where('store_id', $store->id)
                ->where('type', 'bodega')
                ->exists();
            if ($hasBodega) {
                continue; // ya tiene Bodega — idempotente
            }

            $hasExhibicion = DB::table('warehouses')
                ->where('store_id', $store->id)
                ->where('type', 'store')
                ->exists();
            if (! $hasExhibicion) {
                continue; // tienda sin Exhibición (raro) — la crea StoreController
            }

            DB::table('warehouses')->insert([
                'company_id' => $store->company_id,
                'store_id'   => $store->id,
                'name'       => 'Bodega — ' . $store->name,
                'type'       => 'bodega',
                'active'     => true,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    public function down(): void
    {
        // Borrar bodegas vacías creadas por el backfill sería destructivo si ya
        // se les movió stock. Intencionalmente vacío.
    }
};
