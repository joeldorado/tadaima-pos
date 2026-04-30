<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// NOTE: manager_id is declared WITHOUT FK constraint here to break the
// circular dependency (users.store_id → stores).
// The FK is added in: 2026_04_09_000038_add_deferred_foreign_keys.php

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('stores', function (Blueprint $table) {
            $table->id();
            $table->foreignId('company_id')->constrained()->cascadeOnDelete();
            $table->string('name');
            $table->string('address')->nullable();
            $table->string('phone', 20)->nullable();
            $table->string('email')->nullable();
            $table->unsignedBigInteger('manager_id')->nullable(); // FK added later
            $table->boolean('active')->default(true);
            $table->timestamps();

            $table->index('manager_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('stores');
    }
};
