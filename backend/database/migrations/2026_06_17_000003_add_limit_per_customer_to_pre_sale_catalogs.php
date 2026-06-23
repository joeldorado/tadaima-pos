<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Límite de unidades POR CLIENTE por catálogo de preventa.
 * `null` = sin límite. Independiente del `preorder_limit` (tope global) y de
 * los `store_limits` (cupo por tienda). Decisión Joel 2026-06-17.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('pre_sale_catalogs', function (Blueprint $table) {
            $table->unsignedInteger('limit_per_customer')->nullable()->after('preorder_limit');
        });
    }

    public function down(): void
    {
        Schema::table('pre_sale_catalogs', function (Blueprint $table) {
            $table->dropColumn('limit_per_customer');
        });
    }
};
