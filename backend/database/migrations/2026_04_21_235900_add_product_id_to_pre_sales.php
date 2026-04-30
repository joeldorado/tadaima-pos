<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('pre_sales', function (Blueprint $table) {
            $table->foreignId('product_id')
                ->nullable()
                ->constrained('products')
                ->nullOnDelete()
                ->after('linked_sale_id');
        });
    }

    public function down(): void
    {
        Schema::table('pre_sales', function (Blueprint $table) {
            $table->dropForeignIdFor(\App\Models\Product::class);
            $table->dropColumn('product_id');
        });
    }
};
