<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('mangas', function (Blueprint $table) {
            $table->decimal('price_1', 12, 2)->nullable()->after('cost');
            $table->decimal('price_2', 12, 2)->nullable()->after('price_1');
            $table->decimal('price_3', 12, 2)->nullable()->after('price_2');
            $table->decimal('price_4', 12, 2)->nullable()->after('price_3');
            $table->decimal('price_5', 12, 2)->nullable()->after('price_4');
            $table->unsignedInteger('stock')->default(0)->after('price_5');
        });
    }

    public function down(): void
    {
        Schema::table('mangas', function (Blueprint $table) {
            $table->dropColumn(['price_1', 'price_2', 'price_3', 'price_4', 'price_5', 'stock']);
        });
    }
};
