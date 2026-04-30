<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('sales', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained()->cascadeOnDelete();
            $table->foreignId('register_session_id')
                  ->constrained('cash_register_sessions')
                  ->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('customer_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('terminal_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('draft_id')
                  ->nullable()
                  ->constrained('sales_drafts')
                  ->nullOnDelete();
            $table->decimal('subtotal', 12, 2);
            $table->decimal('discount', 12, 2)->default(0.00);
            $table->decimal('total', 12, 2);
            $table->decimal('commission_amount', 12, 2)->default(0.00);
            $table->enum('status', ['completed', 'cancelled', 'returned'])->default('completed');
            $table->timestamp('sold_at')->useCurrent();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['store_id', 'sold_at']);
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sales');
    }
};
