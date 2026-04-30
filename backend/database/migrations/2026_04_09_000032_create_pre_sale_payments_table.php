<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Pagos de anticipo de preventa (antes del cierre como venta final).
// Separada de la tabla payments para trazabilidad de anticipos.

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pre_sale_payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('pre_sale_id')->constrained()->cascadeOnDelete();
            $table->decimal('amount', 12, 2);
            $table->foreignId('payment_method_id')
                  ->nullable()
                  ->constrained()
                  ->nullOnDelete();
            $table->string('notes')->nullable();
            $table->timestamp('created_at')->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pre_sale_payments');
    }
};
