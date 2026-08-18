<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Snapshot de identidad del producto en la línea de venta (2026-08-18, Joel).
 *
 * Escenario real: se vende un producto y después se ELIMINA del catálogo
 * ("ya no tendré más y no quiero el registro"). `sale_items.product_id` es
 * nullOnDelete — la venta y sus montos sobreviven, pero la línea perdía el
 * nombre/SKU (historial y reportes mostraban "Artículo Desconocido").
 *
 * Mismo espíritu que ADR-015 (`cost` congelado al INSERT): `product_name` y
 * `product_sku` se congelan en el checkout y son la verdad histórica de la
 * línea. Backfill idempotente desde `products` para las ventas existentes;
 * las líneas cuyo producto YA fue borrado antes de esta migración no tienen
 * de dónde recuperarse y quedan NULL.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sale_items', function (Blueprint $table) {
            $table->string('product_name')->nullable()->after('manga_id');
            $table->string('product_sku', 100)->nullable()->after('product_name');
        });

        // Subquery correlacionado — portable (SQLite tests, MySQL dev, pgsql prod).
        DB::table('sale_items')
            ->whereNull('product_name')
            ->whereNotNull('product_id')
            ->update([
                'product_name' => DB::raw('(SELECT name FROM products WHERE products.id = sale_items.product_id)'),
                'product_sku' => DB::raw('(SELECT sku FROM products WHERE products.id = sale_items.product_id)'),
            ]);
    }

    public function down(): void
    {
        Schema::table('sale_items', function (Blueprint $table) {
            $table->dropColumn(['product_name', 'product_sku']);
        });
    }
};
