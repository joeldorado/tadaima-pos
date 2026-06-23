<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Guarda los dólares físicos recibidos por venta + el tipo de cambio usado.
 *
 * Antes, cuando un ticket se pagaba con USD (ej. 50 USD + 500 MXN), el frontend
 * convertía los dólares a pesos y solo persistía el equivalente en MXN — no
 * quedaba registro de cuántos dólares entraron. Ahora se guarda el monto en USD
 * y el TC del momento (snapshot, espíritu ADR-015) para Historial, Corte y
 * Reporte del día.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sales', function (Blueprint $table) {
            $table->decimal('cash_received_usd', 12, 2)->nullable()->after('commission_amount');
            $table->decimal('exchange_rate', 12, 4)->nullable()->after('cash_received_usd');
        });
    }

    public function down(): void
    {
        Schema::table('sales', function (Blueprint $table) {
            $table->dropColumn(['cash_received_usd', 'exchange_rate']);
        });
    }
};
