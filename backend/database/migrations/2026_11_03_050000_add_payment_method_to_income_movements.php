<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('income_movements', function (Blueprint $table) {
            // Cómo entró el dinero: solo 'cash' pega al cajón físico (cash_movement_id
            // se llena); 'card'/'transfer' son informativos (no tocan el esperado de
            // caja, igual que supplies.money_source != 'caja'). Default 'cash' para no
            // romper los registros existentes (todos se crearon asumiendo efectivo).
            $table->string('payment_method', 20)->default('cash')->after('type');
        });
    }

    public function down(): void
    {
        Schema::table('income_movements', function (Blueprint $table) {
            $table->dropColumn('payment_method');
        });
    }
};
