<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Completa el registro de "cómo se pagó" una venta en efectivo.
 *
 * Antes solo se guardaba `cash_received_usd` + `exchange_rate` (dólares físicos
 * y TC). El efectivo en pesos entregado y el cambio devuelto se calculaban en el
 * frontend al momento de cobrar pero NO se persistían — así que al reimprimir el
 * ticket desde Historial o al ver el detalle de la venta, ese desglose se perdía
 * (o se reconstruía con el TC de HOY, no el de la venta).
 *
 * Ahora guardamos:
 *  - `cash_received`: total de efectivo entregado por el cliente, en MXN
 *    (incluye los dólares ya convertidos a TC). Permite mostrar Recibido/Cambio.
 *  - `change_amount`: cambio devuelto en MXN.
 *
 * Ambos son NULL para pagos con tarjeta/transferencia (no hay efectivo recibido
 * ni cambio). Espíritu ADR-015: snapshot inmutable al momento del cobro.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sales', function (Blueprint $table) {
            $table->decimal('cash_received', 12, 2)->nullable()->after('exchange_rate');
            $table->decimal('change_amount', 12, 2)->nullable()->after('cash_received');
        });
    }

    public function down(): void
    {
        Schema::table('sales', function (Blueprint $table) {
            $table->dropColumn(['cash_received', 'change_amount']);
        });
    }
};
