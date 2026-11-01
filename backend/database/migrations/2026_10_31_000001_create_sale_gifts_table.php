<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Regalos en Caja (2026-10-31, pedido del cliente: «Botón de Regalo»).
 *
 * Una línea marcada como regalo se guarda en sale_items con price = total =
 * cost = 0, así ningún reporte (ingreso, costo, utilidad) la cuenta como venta.
 * Esta tabla guarda QUÉ se regaló: el precio de catálogo que se validó al cobrar
 * y el costo real del producto en ese momento (products.cost no se toca), con
 * nota y quién lo marcó. 1:1 con su sale_item (cascade: si la línea se cancela
 * completa, se va con ella; el snapshot de la cancelación lleva is_gift).
 *
 * Aditiva e idempotente — corre sola en prod en el deploy.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('sale_gifts')) {
            return;
        }

        Schema::create('sale_gifts', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('sale_id')->constrained('sales')->cascadeOnDelete();
            $table->foreignId('sale_item_id')->unique()->constrained('sale_items')->cascadeOnDelete();
            $table->foreignId('product_id')->nullable()->constrained('products')->nullOnDelete();
            $table->foreignId('store_id')->nullable()->constrained('stores')->nullOnDelete();
            $table->decimal('quantity', 12, 2);
            // Precio de catálogo (nivel que mandó Caja, ya validado) por pieza.
            $table->decimal('list_price', 12, 2);
            // Costo real por pieza al momento de regalar (products.cost).
            $table->decimal('unit_cost', 12, 2)->nullable();
            $table->string('note', 80)->nullable();
            $table->foreignId('authorized_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();

            $table->index('sale_id', 'sg_sale_idx');
            $table->index(['store_id', 'created_at'], 'sg_store_created_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sale_gifts');
    }
};
