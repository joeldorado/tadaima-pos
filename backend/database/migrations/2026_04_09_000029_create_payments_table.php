<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// sale_id y pre_sale_id son nullable pero uno debe estar presente (validado en app).
// Unifica pagos de ventas y preventas en una sola tabla.

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('payments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sale_id')->nullable()->constrained()->cascadeOnDelete();
            $table->foreignId('pre_sale_id')->nullable(); // FK añadida después de pre_sales
            $table->foreignId('payment_method_id')->constrained()->cascadeOnDelete();
            $table->foreignId('terminal_id')->nullable()->constrained()->nullOnDelete();
            $table->decimal('amount', 12, 2);
            $table->decimal('commission_amount', 12, 2)->default(0.00);
            $table->timestamp('created_at')->useCurrent();

            $table->index('sale_id');
            $table->index('pre_sale_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('payments');
    }
};
