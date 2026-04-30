<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('layaway_logs', function (Blueprint $table) {
            $table->id();
            $table->foreignId('layaway_id')->constrained('layaways')->cascadeOnDelete();
            $table->string('action');
            $table->foreignId('user_id')->constrained('users');
            $table->text('notes')->nullable();
            $table->timestamp('created_at')->useCurrent();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('layaway_logs');
    }
};
