<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Resuelve las dependencias circulares declaradas sin FK en migraciones anteriores:
//
//   users.company_id  → companies.id   (users se crea antes que companies)
//   users.store_id    → stores.id      (users se crea antes que stores)
//   stores.manager_id → users.id       (stores se crea antes que users)
//   payments.pre_sale_id → pre_sales.id (payments se crea antes que pre_sales)

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->foreign('company_id')
                  ->references('id')->on('companies')
                  ->nullOnDelete();

            $table->foreign('store_id')
                  ->references('id')->on('stores')
                  ->nullOnDelete();
        });

        Schema::table('stores', function (Blueprint $table) {
            $table->foreign('manager_id')
                  ->references('id')->on('users')
                  ->nullOnDelete();
        });

        Schema::table('payments', function (Blueprint $table) {
            $table->foreign('pre_sale_id')
                  ->references('id')->on('pre_sales')
                  ->cascadeOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('payments', function (Blueprint $table) {
            $table->dropForeign(['pre_sale_id']);
        });

        Schema::table('stores', function (Blueprint $table) {
            $table->dropForeign(['manager_id']);
        });

        Schema::table('users', function (Blueprint $table) {
            $table->dropForeign(['store_id']);
            $table->dropForeign(['company_id']);
        });
    }
};
