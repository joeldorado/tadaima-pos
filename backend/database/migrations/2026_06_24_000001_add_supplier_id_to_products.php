<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Vincula cada producto con un proveedor (suppliers). Aditiva y nullable:
// productos existentes quedan sin proveedor hasta que se les asigne uno.
// Idempotente (hasColumn) porque corre sola en cada deploy.
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasColumn('products', 'supplier_id')) {
            return;
        }

        Schema::table('products', function (Blueprint $table) {
            $table->foreignId('supplier_id')
                  ->nullable()
                  ->after('category_id')
                  ->constrained('suppliers')
                  ->nullOnDelete();
        });
    }

    public function down(): void
    {
        if (! Schema::hasColumn('products', 'supplier_id')) {
            return;
        }

        Schema::table('products', function (Blueprint $table) {
            $table->dropForeign(['supplier_id']);
            $table->dropColumn('supplier_id');
        });
    }
};
