<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Rollup del aumento de precio (2026-09-29): sales.surcharge = Σ
 * sale_items.surcharge_amount. total = subtotal − discount + surcharge.
 * Aditiva e idempotente; default 0 no cambia ninguna venta existente.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('sales', 'surcharge')) {
            Schema::table('sales', function (Blueprint $table) {
                $table->decimal('surcharge', 12, 2)->default(0);
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('sales', 'surcharge')) {
            Schema::table('sales', function (Blueprint $table) {
                $table->dropColumn('surcharge');
            });
        }
    }
};
