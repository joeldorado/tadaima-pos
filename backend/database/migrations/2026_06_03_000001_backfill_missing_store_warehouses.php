<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Backfill: toda tienda necesita su almacén `type='store'` para aparecer en el
 * selector de inventario del alta de producto (el selector lista warehouses, no
 * stores). El seeder y `StoreController::store` ya lo crean, pero las tiendas
 * dadas de alta por UI ANTES del fix QA 2026-06-03 (rev tadaima-00065) quedaron
 * sin bodega → invisibles al asignar stock. Esta migración les crea la suya.
 *
 * Idempotente: solo toca tiendas que NO tienen ya un warehouse type='store'.
 */
return new class extends Migration
{
    public function up(): void
    {
        $now = now();

        $storesSinBodega = DB::table('stores')
            ->whereNotExists(function ($q) {
                $q->select(DB::raw(1))
                    ->from('warehouses')
                    ->whereColumn('warehouses.store_id', 'stores.id')
                    ->where('warehouses.type', 'store');
            })
            ->get(['id', 'company_id', 'name']);

        foreach ($storesSinBodega as $store) {
            DB::table('warehouses')->insert([
                'company_id' => $store->company_id,
                'store_id'   => $store->id,
                'name'       => $store->name,
                'type'       => 'store',
                'active'     => true,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
        }
    }

    public function down(): void
    {
        // No-op: no podemos distinguir con seguridad las bodegas creadas aquí de
        // las legítimas, y borrar warehouses con inventario sería destructivo.
    }
};
