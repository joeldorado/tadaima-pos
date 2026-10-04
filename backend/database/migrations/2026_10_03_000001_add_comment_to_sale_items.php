<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Comentario por línea en Caja (2026-10-03, pedido de las tiendas vía Joel).
 *
 * Texto corto que el cajero anota en la línea desde el menú ⋮ como
 * recordatorio interno ("para la promo", "regalo"). Va en su propia columna:
 * `discount_note` / `surcharge_note` solo existen cuando la línea lleva
 * descuento o aumento. No participa en ningún monto ni se imprime en el ticket.
 *
 * Aditiva e idempotente — corre sola en prod en el deploy. NULL en todas las
 * ventas anteriores.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('sale_items', 'comment')) {
            Schema::table('sale_items', function (Blueprint $table) {
                $table->string('comment', 255)->nullable();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('sale_items', 'comment')) {
            Schema::table('sale_items', function (Blueprint $table) {
                $table->dropColumn('comment');
            });
        }
    }
};
