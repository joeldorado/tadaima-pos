<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// ADR-010: Catálogo de preventa — entidad separada de los folios de cliente.
// Un registro aquí representa un PRODUCTO disponible para pre-orden, creado
// por el admin. No tiene customer_id ni folio. Los folios (pre_sale_orders)
// referencian a esta tabla cuando el cajero aparta mercancía para un cliente.

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pre_sale_catalogs', function (Blueprint $table) {
            $table->id();

            // Clasificación del producto
            $table->foreignId('category_id')
                  ->nullable()
                  ->constrained('product_categories')
                  ->nullOnDelete();

            $table->foreignId('supplier_id')
                  ->nullable()
                  ->constrained('suppliers')
                  ->nullOnDelete();

            // Producto real en inventario — nullable hasta que llegue la mercancía
            // y el admin lo vincule tras ejecutar "Asignar inventario"
            $table->foreignId('product_id')
                  ->nullable()
                  ->constrained('products')
                  ->nullOnDelete();

            // Admin que creó el catálogo
            $table->foreignId('created_by')
                  ->nullable()
                  ->constrained('users')
                  ->nullOnDelete();

            // Descripción del producto
            $table->string('product_name');
            $table->string('image_path')->nullable();

            // Costos y márgenes (para reportes internos)
            $table->decimal('cost', 12, 2)->nullable();
            $table->decimal('margin_percent', 5, 2)->nullable();

            // Hasta 5 niveles de precio — el cajero elige cuál aplicar al folio
            $table->decimal('price_1', 12, 2)->nullable();
            $table->decimal('price_2', 12, 2)->nullable();
            $table->decimal('price_3', 12, 2)->nullable();
            $table->decimal('price_4', 12, 2)->nullable();
            $table->decimal('price_5', 12, 2)->nullable();

            // Anticipo mínimo requerido para crear un folio
            $table->decimal('advance_payment', 12, 2)->default(0);

            // Límite de unidades que se pueden pre-vender (NULL = sin límite)
            $table->unsignedInteger('preorder_limit')->nullable();

            // Logística de llegada
            $table->date('arrival_date')->nullable();
            $table->date('pickup_deadline')->nullable();

            // draft      → admin configurando, invisible en caja
            // published  → visible en modal de preventas en caja
            // closed     → mercancía llegó, sin más órdenes nuevas
            // cancelled  → anulado
            $table->enum('status', ['draft', 'published', 'closed', 'cancelled'])
                  ->default('draft');

            $table->timestamps();

            $table->index('status');
            $table->index(['status', 'category_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pre_sale_catalogs');
    }
};
