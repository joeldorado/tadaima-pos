<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Líneas del folio. Cada ítem referencia un catálogo (pre_sale_catalogs)
// y almacena el precio congelado al momento de la venta (unit_price).
// product_id se asigna cuando el admin vincula el catálogo a un producto real
// tras la llegada de mercancía — hasta entonces es null.
// FK al catálogo es RESTRICT: no se puede borrar un catálogo con folios activos.

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pre_sale_order_items', function (Blueprint $table) {
            $table->id();

            $table->foreignId('pre_sale_order_id')
                  ->constrained('pre_sale_orders')
                  ->cascadeOnDelete();

            // RESTRICT: el catálogo no puede eliminarse mientras tenga folios
            $table->unsignedBigInteger('pre_sale_catalog_id');
            $table->foreign('pre_sale_catalog_id')
                  ->references('id')
                  ->on('pre_sale_catalogs')
                  ->restrictOnDelete();

            // Producto real en inventario — null hasta que llegue la mercancía
            $table->foreignId('product_id')
                  ->nullable()
                  ->constrained('products')
                  ->nullOnDelete();

            $table->unsignedInteger('quantity');

            // Nivel de precio 1-5 elegido por el cajero al crear el folio
            $table->tinyInteger('price_level')->unsigned()->default(1);

            // Precio unitario congelado al momento de la venta
            // (no debe cambiar si el admin modifica el catálogo después)
            $table->decimal('unit_price', 12, 2);

            // pending   → pendiente de entrega
            // delivered → entregado físicamente al cliente
            $table->enum('status', ['pending', 'delivered'])->default('pending');

            $table->timestamp('delivered_at')->nullable();

            $table->timestamp('created_at')->useCurrent();

            // Para contar unidades vendidas por catálogo (respetar preorder_limit)
            $table->index(['pre_sale_catalog_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pre_sale_order_items');
    }
};
