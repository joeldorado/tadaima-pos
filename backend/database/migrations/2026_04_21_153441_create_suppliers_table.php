<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('suppliers', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->boolean('active')->default(true);
            $table->timestamps();
        });

        // Replace free-text supplier column with FK
        Schema::table('pre_sales', function (Blueprint $table) {
            $table->foreignId('supplier_id')
                  ->nullable()
                  ->after('category_id')
                  ->constrained('suppliers')
                  ->nullOnDelete();
            $table->dropColumn('supplier');
        });
    }

    public function down(): void
    {
        Schema::table('pre_sales', function (Blueprint $table) {
            $table->dropForeign(['supplier_id']);
            $table->dropColumn('supplier_id');
            $table->string('supplier')->nullable()->after('category_id');
        });

        Schema::dropIfExists('suppliers');
    }
};
