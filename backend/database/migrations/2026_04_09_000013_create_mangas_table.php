<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Entidad separada de products. Lógica de costo calculado automáticamente:
// cost = public_price * (1 - profit_margin_percent / 100)

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('mangas', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->unsignedSmallInteger('volume_number')->nullable();
            $table->string('editorial')->nullable();
            $table->string('code')->nullable()->index();
            $table->string('genre')->nullable();
            $table->decimal('public_price', 12, 2);
            $table->decimal('profit_margin_percent', 5, 2); // e.g. 30.00 = 30%
            $table->decimal('cost', 12, 2)->nullable();     // calculado en backend
            $table->boolean('active')->default(true);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('mangas');
    }
};
