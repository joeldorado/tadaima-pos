<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('pre_sale_items', function (Blueprint $table) {
            $table->enum('status', ['pending', 'delivered'])->default('pending')->after('price');
        });
    }

    public function down(): void
    {
        Schema::table('pre_sale_items', function (Blueprint $table) {
            $table->dropColumn('status');
        });
    }
};
