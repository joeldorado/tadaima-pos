<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * ADR-014 cutover: el carrito ahora vive client-side hasta el cobro. Cualquier
 * draft con status='open' que quede en MySQL es residuo del modelo anterior
 * (incluidos los huérfanos del bug de clearCart que no cancelaba el server).
 *
 * One-shot: cancela todos los drafts open al deployar. No hay rollback —
 * la idea es que después de este punto solo existen drafts efímeros creados
 * dentro de la transacción de checkout y marcados 'completed' al instante.
 */
return new class extends Migration {
    public function up(): void
    {
        $count = DB::table('sales_drafts')
            ->where('status', 'open')
            ->update(['status' => 'cancelled', 'updated_at' => now()]);

        if ($count > 0) {
            echo "  Cancelled {$count} legacy open drafts (ADR-014 cutover)" . PHP_EOL;
        }
    }

    public function down(): void
    {
        // No reversible — los drafts cancelados no se pueden distinguir de los
        // que el cajero canceló manualmente.
    }
};
