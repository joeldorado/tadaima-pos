<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('pre_sales', function (Blueprint $table) {
            $table->date('arrival_date')->nullable()->after('pickup_deadline');
            $table->boolean('inventory_pushed')->default(false)->after('arrival_date');
            $table->foreignId('linked_sale_id')->nullable()->after('inventory_pushed')
                  ->constrained('sales')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('pre_sales', function (Blueprint $table) {
            $table->dropForeign(['linked_sale_id']);
            $table->dropColumn(['arrival_date', 'inventory_pushed', 'linked_sale_id']);
        });
    }
};
