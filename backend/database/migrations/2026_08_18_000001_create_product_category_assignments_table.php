<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Categorías MÚLTIPLES por producto (Joel 2026-08-17): un producto puede
 * pertenecer a N categorías, todas iguales (sin "principal"). Pivote
 * `product_category_assignments` (mismo patrón que
 * product_promotion_assignments). `products.category_id` se CONSERVA solo como
 * caché de compatibilidad (= la primera del pivote por position) para
 * consumidores legacy (light resource, app móvil, SQL crudo); la fuente de
 * verdad es el pivote — ver Product::syncCategories().
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_category_assignments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->foreignId('category_id')->constrained('product_categories')->cascadeOnDelete();
            // Orden en que el usuario las eligió (solo para pintar estable).
            $table->unsignedSmallInteger('position')->default(0);
            $table->timestamps();

            // Un producto no puede estar dos veces en la misma categoría; el
            // unique también hace idempotente el backfill (000002).
            $table->unique(['product_id', 'category_id']);
            $table->index('category_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_category_assignments');
    }
};
