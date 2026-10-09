<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Paquetes (2026-10-07): composición de un paquete.
 *
 * Un paquete (products.product_type='bundle') lleva N productos componentes
 * con una cantidad cada uno. El stock del paquete vive en `inventory` como el
 * de cualquier producto; armar/desarmar mueve stock entre componentes y
 * paquete (ver App\Services\BundleService).
 *
 * component_product_id es RESTRICT a propósito: un producto que es componente
 * de un paquete no se borra (ProductController::destroy lo avisa con 422);
 * si se borrara en cascada el paquete quedaría con menos de 2 componentes y,
 * con paquetes armados, no se podría desarmar.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('product_bundle_items')) {
            return;
        }

        Schema::create('product_bundle_items', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('bundle_product_id')->constrained('products')->cascadeOnDelete();
            $table->foreignId('component_product_id')->constrained('products')->restrictOnDelete();
            $table->unsignedSmallInteger('quantity'); // piezas por paquete (>= 1, validado en request)
            $table->unsignedSmallInteger('position')->default(0);
            $table->timestamps();

            $table->unique(['bundle_product_id', 'component_product_id'], 'pbi_bundle_component_unique');
            $table->index('component_product_id', 'pbi_component_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_bundle_items');
    }
};
