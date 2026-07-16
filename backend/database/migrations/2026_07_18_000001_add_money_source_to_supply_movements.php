<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Origen del dinero en compras de insumos (2026-07-18, pedido de Joel):
 * ¿de dónde salió el efectivo? 'caja' (cajón del usuario, comportamiento
 * histórico), 'caja_chica' o 'propio' (alguien puso de su dinero → payer_name).
 *
 * String + validación en app (no enum de DB): los orígenes pueden crecer
 * (transferencia, tarjeta empresa…) sin ALTER. NULL = no aplica
 * (consumption/adjustment no manejan dinero).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('supply_movements', function (Blueprint $table) {
            $table->string('money_source', 20)->nullable()->after('note');
            $table->string('payer_name', 100)->nullable()->after('money_source');
        });

        // Backfill idempotente: toda compra histórica salió de la caja
        // (registerPurchase exigía caja abierta y creaba la salida ligada).
        DB::table('supply_movements')
            ->where('type', 'purchase')
            ->whereNull('money_source')
            ->update(['money_source' => 'caja']);
    }

    public function down(): void
    {
        Schema::table('supply_movements', function (Blueprint $table) {
            $table->dropColumn(['money_source', 'payer_name']);
        });
    }
};
