<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Catálogo Online v3 — flags por producto para el catálogo de cadena:
 * `featured` (destacado, orden preferente) y `catalog_visible` (permite
 * ocultar un producto del catálogo público SIN desactivarlo del POS).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            if (!Schema::hasColumn('products', 'featured')) {
                $table->boolean('featured')->default(false)->after('active');
            }
            if (!Schema::hasColumn('products', 'catalog_visible')) {
                $table->boolean('catalog_visible')->default(true)->after('featured');
            }
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table) {
            if (Schema::hasColumn('products', 'catalog_visible')) {
                $table->dropColumn('catalog_visible');
            }
            if (Schema::hasColumn('products', 'featured')) {
                $table->dropColumn('featured');
            }
        });
    }
};
