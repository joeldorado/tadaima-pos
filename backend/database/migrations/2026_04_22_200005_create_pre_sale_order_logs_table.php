<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Auditoría de cambios de status en folios.
// from_status es nullable para el primer log (creación del folio).

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pre_sale_order_logs', function (Blueprint $table) {
            $table->id();

            $table->foreignId('pre_sale_order_id')
                  ->constrained('pre_sale_orders')
                  ->cascadeOnDelete();

            $table->foreignId('user_id')
                  ->nullable()
                  ->constrained('users')
                  ->nullOnDelete();

            $table->enum('from_status', ['pending', 'ready', 'delivered', 'expired', 'cancelled'])
                  ->nullable();

            $table->enum('to_status', ['pending', 'ready', 'delivered', 'expired', 'cancelled']);

            $table->text('notes')->nullable();

            $table->timestamp('created_at')->useCurrent();

            $table->index('pre_sale_order_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pre_sale_order_logs');
    }
};
