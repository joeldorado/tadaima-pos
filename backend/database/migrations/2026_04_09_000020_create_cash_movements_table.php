<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('cash_movements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('register_session_id')
                  ->constrained('cash_register_sessions')
                  ->cascadeOnDelete();
            $table->enum('type', ['entrada', 'salida', 'ajuste']);
            $table->decimal('amount', 12, 2);
            $table->string('description')->nullable();
            $table->timestamp('created_at')->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('cash_movements');
    }
};
