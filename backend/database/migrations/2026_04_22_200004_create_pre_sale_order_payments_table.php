<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Pagos registrados contra un folio (anticipos y liquidaciones).
// Un folio puede tener múltiples pagos: el primer anticipo al apartar,
// pagos parciales adicionales, y el pago final de liquidación.
// paid_amount y balance del folio se computan en Eloquent
// sumando todos los registros de esta tabla (mismo patrón que Layaway).

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pre_sale_order_payments', function (Blueprint $table) {
            $table->id();

            $table->foreignId('pre_sale_order_id')
                  ->constrained('pre_sale_orders')
                  ->cascadeOnDelete();

            $table->decimal('amount', 12, 2);

            $table->foreignId('payment_method_id')
                  ->nullable()
                  ->constrained('payment_methods')
                  ->nullOnDelete();

            // Cajero que registró el pago
            $table->foreignId('cashier_id')
                  ->nullable()
                  ->constrained('users')
                  ->nullOnDelete();

            $table->text('notes')->nullable();

            // Los pagos son inmutables — solo created_at
            $table->timestamp('created_at')->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pre_sale_order_payments');
    }
};
