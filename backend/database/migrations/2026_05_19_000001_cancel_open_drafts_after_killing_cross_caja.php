<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Limpieza posterior a eliminar el sistema de "reserva cross-caja" en
 * CheckoutService::reserveStock. Cualquier draft con status='open' que quede
 * en MySQL es residuo del modelo anterior (drafts huérfanos de checkouts
 * fallidos pre-ADR-014, o de los crons de expiración que estaban
 * desactivados).
 *
 * Con la nueva validación basada solo en stock real + lockForUpdate, estos
 * drafts ya no afectan ventas, pero ocupan espacio. Los marcamos como
 * cancelled para mantener la tabla limpia.
 */
return new class extends Migration {
    public function up(): void
    {
        $count = DB::table('sales_drafts')
            ->where('status', 'open')
            ->update(['status' => 'cancelled', 'updated_at' => now()]);

        if ($count > 0) {
            echo "  Cancelled {$count} ghost open drafts (post cross-caja kill)" . PHP_EOL;
        }
    }

    public function down(): void
    {
        // No reversible.
    }
};
