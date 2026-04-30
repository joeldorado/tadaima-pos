<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Estados (ADR-002): live → ready → completed | expired | cancelled
// El frontend usaba pending/entregado/cancelado — se adapta al backend.

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pre_sales', function (Blueprint $table) {
            $table->id();
            $table->foreignId('store_id')->constrained()->cascadeOnDelete();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->foreignId('customer_id')->nullable()->constrained()->nullOnDelete();
            $table->string('code')->unique();
            $table->string('product_name');
            $table->decimal('advance_payment', 12, 2)->default(0.00);
            $table->unsignedInteger('preorder_limit')->default(0);
            $table->unsignedInteger('reserved_quantity')->default(1);
            $table->date('pickup_deadline')->nullable();
            $table->enum('status', ['live', 'ready', 'expired', 'completed', 'cancelled'])
                  ->default('live');
            $table->decimal('cost', 12, 2)->nullable();
            $table->decimal('margin_percent', 5, 2)->nullable();
            $table->timestamps();

            $table->index(['store_id', 'status']);
            $table->index('code');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pre_sales');
    }
};
