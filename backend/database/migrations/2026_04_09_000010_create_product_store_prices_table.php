<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Precios diferenciados por tienda. Sobreescriben product_prices para una sucursal específica.

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_store_prices', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->foreignId('store_id')->constrained()->cascadeOnDelete();
            $table->tinyInteger('price_level')->unsigned(); // 1–5
            $table->decimal('price', 12, 2);
            $table->timestamps();

            $table->unique(['product_id', 'store_id', 'price_level']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_store_prices');
    }
};
