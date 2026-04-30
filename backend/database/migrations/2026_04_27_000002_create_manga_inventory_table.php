<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('manga_inventory', function (Blueprint $table) {
            $table->id();
            $table->foreignId('manga_id')->constrained('mangas')->cascadeOnDelete();
            $table->foreignId('warehouse_id')->constrained('warehouses')->cascadeOnDelete();
            $table->unsignedInteger('quantity')->default(0);
            $table->timestamps();
            $table->unique(['manga_id', 'warehouse_id']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('manga_inventory');
    }
};
