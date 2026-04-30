<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// ADR-003: Pre-sales can be created at catalog level (admin, no specific store/customer).
// store_id becomes nullable for "global" admin pre-sales.
// Prices 1–5 stored on the pre-sale so they pre-fill when creating the product.

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('pre_sales', function (Blueprint $table) {
            // Make store global (nullable = applies to all stores)
            $table->dropForeign(['store_id']);
            $table->unsignedBigInteger('store_id')->nullable()->change();
            $table->foreign('store_id')->references('id')->on('stores')->nullOnDelete();

            // Category (optional, reuses product categories)
            $table->foreignId('category_id')
                  ->nullable()
                  ->after('store_id')
                  ->constrained('product_categories')
                  ->nullOnDelete();

            // Supplier name (free text, no separate table)
            $table->string('supplier')->nullable()->after('category_id');

            // 5 price levels — pre-filled when product is created from this pre-sale
            $table->decimal('price_1', 12, 2)->nullable()->after('margin_percent');
            $table->decimal('price_2', 12, 2)->nullable()->after('price_1');
            $table->decimal('price_3', 12, 2)->nullable()->after('price_2');
            $table->decimal('price_4', 12, 2)->nullable()->after('price_3');
            $table->decimal('price_5', 12, 2)->nullable()->after('price_4');
        });
    }

    public function down(): void
    {
        Schema::table('pre_sales', function (Blueprint $table) {
            $table->dropColumn(['price_1', 'price_2', 'price_3', 'price_4', 'price_5', 'supplier']);
            $table->dropForeign(['category_id']);
            $table->dropColumn('category_id');

            $table->dropForeign(['store_id']);
            $table->unsignedBigInteger('store_id')->nullable(false)->change();
            $table->foreign('store_id')->references('id')->on('stores')->cascadeOnDelete();
        });
    }
};
