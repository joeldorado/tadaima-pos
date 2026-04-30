<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('point_transactions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('customer_id')->constrained()->cascadeOnDelete();
            $table->unsignedInteger('points');
            $table->string('reason', 100);
            $table->string('reference_type', 20);  // 'pre_sale' | 'sale'
            $table->unsignedBigInteger('reference_id');
            $table->timestamp('created_at')->useCurrent();

            // Prevent double-awarding for the same sale/pre-sale
            $table->unique(['reference_type', 'reference_id'], 'uniq_point_reference');
            $table->index(['customer_id', 'created_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('point_transactions');
    }
};
