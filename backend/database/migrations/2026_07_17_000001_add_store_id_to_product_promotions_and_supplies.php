<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Scoping por tienda (pedido Joel 2026-07-16):
 *  - product_promotions.store_id: NULL = aplica en TODAS las tiendas (compat
 *    con las promos existentes); con valor = solo esa sucursal. El motor
 *    (SaleCalculator + embed active_promotions) filtra por la tienda de la venta.
 *  - supplies.store_id: NULL = insumo de toda la empresa; con valor = solo esa
 *    tienda lo ve/usa. Los gastos ya estaban amarrados a la caja del comprador.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('product_promotions', function (Blueprint $table) {
            $table->foreignId('store_id')->nullable()->after('product_id')
                ->constrained('stores')->nullOnDelete();
            $table->index(['store_id', 'status']);
        });

        Schema::table('supplies', function (Blueprint $table) {
            $table->foreignId('store_id')->nullable()->after('company_id')
                ->constrained('stores')->nullOnDelete();
            $table->index(['company_id', 'store_id']);
        });
    }

    public function down(): void
    {
        Schema::table('product_promotions', function (Blueprint $table) {
            $table->dropConstrainedForeignId('store_id');
        });
        Schema::table('supplies', function (Blueprint $table) {
            $table->dropConstrainedForeignId('store_id');
        });
    }
};
