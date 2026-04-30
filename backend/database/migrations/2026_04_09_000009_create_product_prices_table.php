<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Precios base del producto. Separados de products para futura extensión por tienda.
// price_1 = precio público general, price_2..5 = niveles de precio adicionales.

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_prices', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->decimal('price_1', 12, 2)->nullable();
            $table->decimal('price_2', 12, 2)->nullable();
            $table->decimal('price_3', 12, 2)->nullable();
            $table->decimal('price_4', 12, 2)->nullable();
            $table->decimal('price_5', 12, 2)->nullable();
            $table->timestamps();

            $table->unique('product_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_prices');
    }
};
