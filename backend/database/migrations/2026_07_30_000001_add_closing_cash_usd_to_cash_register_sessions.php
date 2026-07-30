<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Corte en pesos Y dólares (Joel 2026-07-30): al cerrar caja el cajero cuenta
 * los billetes americanos aparte. `closing_cash` pasa a ser SOLO pesos y esta
 * columna guarda los dólares contados. Nullable: sesiones viejas (o cierres que
 * no capturan dólares) conservan el comportamiento de siempre.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('cash_register_sessions', function (Blueprint $table) {
            $table->decimal('closing_cash_usd', 12, 2)->nullable()->after('closing_cash');
        });
    }

    public function down(): void
    {
        Schema::table('cash_register_sessions', function (Blueprint $table) {
            $table->dropColumn('closing_cash_usd');
        });
    }
};
