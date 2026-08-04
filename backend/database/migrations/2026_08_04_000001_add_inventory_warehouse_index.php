<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Índices para los agregados de /products/stats y los filtros de stock del
 * index (2026-08-04). Postgres NO indexa FKs automáticamente (MySQL sí):
 * el JOIN inventory ⋈ warehouses por tienda hacía scan completo de inventory.
 * Tablas chicas (~1.6k filas) → CREATE INDEX normal, instantáneo.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('inventory', function (Blueprint $table) {
            $table->index('warehouse_id', 'inventory_warehouse_id_index');
        });

        Schema::table('warehouses', function (Blueprint $table) {
            $table->index(['store_id', 'type'], 'warehouses_store_id_type_index');
        });
    }

    public function down(): void
    {
        Schema::table('inventory', function (Blueprint $table) {
            $table->dropIndex('inventory_warehouse_id_index');
        });

        Schema::table('warehouses', function (Blueprint $table) {
            $table->dropIndex('warehouses_store_id_type_index');
        });
    }
};
