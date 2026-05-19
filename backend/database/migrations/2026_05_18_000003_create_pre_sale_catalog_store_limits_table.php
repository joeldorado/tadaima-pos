<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Límite de preventas POR TIENDA para cada catálogo. Reemplaza al campo global
 * `pre_sale_catalogs.preorder_limit` cuando hay al menos una fila aquí —
 * permite definir "5 unidades en Centro, 2 en Macroplaza, sin límite en Playas".
 *
 * Si no hay filas para un catálogo, fallback al `preorder_limit` global del
 * catálogo (compat con catálogos creados antes de esta migración).
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::create('pre_sale_catalog_store_limits', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('catalog_id')->constrained('pre_sale_catalogs')->cascadeOnDelete();
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            $table->unsignedInteger('limit_qty');
            $table->timestamps();

            $table->unique(['catalog_id', 'store_id'], 'uniq_catalog_store');
            $table->index(['store_id'], 'idx_pscsl_store');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pre_sale_catalog_store_limits');
    }
};
