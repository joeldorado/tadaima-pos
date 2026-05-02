<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('pre_sale_orders', function (Blueprint $table) {
            $table->foreignId('linked_sale_id')
                ->nullable()
                ->after('store_id')
                ->constrained('sales')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('pre_sale_orders', function (Blueprint $table) {
            $table->dropConstrainedForeignId('linked_sale_id');
        });
    }
};
