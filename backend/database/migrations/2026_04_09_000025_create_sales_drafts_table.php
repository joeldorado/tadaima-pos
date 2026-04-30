<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Carritos de venta activos. Soporta hasta 5 ventas simultáneas por cajero (ADR-003).

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sales_drafts', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained()->cascadeOnDelete();
            $table->foreignId('register_session_id')
                  ->constrained('cash_register_sessions')
                  ->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('customer_id')
                  ->nullable()
                  ->constrained()
                  ->nullOnDelete();
            $table->enum('status', ['open', 'suspended', 'completed', 'cancelled'])->default('open');
            $table->timestamps();

            $table->index(['store_id', 'status']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sales_drafts');
    }
};
