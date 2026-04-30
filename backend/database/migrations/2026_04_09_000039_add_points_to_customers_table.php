<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// El frontend expone un sistema de puntos de lealtad (points) separado del
// saldo a favor (customer_credit). Se agrega la columna al modelo de cliente.

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->unsignedInteger('points')->default(0)->after('loyalty_tier');
        });
    }

    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->dropColumn('points');
        });
    }
};
