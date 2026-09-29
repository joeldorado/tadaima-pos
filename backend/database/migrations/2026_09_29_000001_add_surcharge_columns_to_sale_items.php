<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Aumento de precio por línea (2026-09-29, pedido del cliente vía Joel).
 *
 * Espejo del descuento manual pero hacia arriba, en columnas PROPIAS para no
 * tocar la semántica de `discount_amount` (≥ 0, la leen reportes y Ruben).
 * Neto de la línea = total − discount_amount + surcharge_amount.
 *
 * kind/basis van como string (validados en CheckoutRequest), no enum: así no
 * aparecen CHECK constraints nuevos en Postgres. Aditiva e idempotente — corre
 * sola en prod en el deploy. Default 0 deja todas las ventas viejas cuadradas.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sale_items', function (Blueprint $table) {
            if (! Schema::hasColumn('sale_items', 'surcharge_kind')) {
                $table->string('surcharge_kind', 10)->nullable();
            }
            if (! Schema::hasColumn('sale_items', 'surcharge_basis')) {
                $table->string('surcharge_basis', 10)->nullable();
            }
            if (! Schema::hasColumn('sale_items', 'surcharge_value')) {
                $table->decimal('surcharge_value', 12, 2)->nullable();
            }
            if (! Schema::hasColumn('sale_items', 'surcharge_amount')) {
                $table->decimal('surcharge_amount', 12, 2)->default(0);
            }
            if (! Schema::hasColumn('sale_items', 'surcharge_reason')) {
                $table->string('surcharge_reason', 40)->nullable();
            }
            if (! Schema::hasColumn('sale_items', 'surcharge_note')) {
                $table->string('surcharge_note', 255)->nullable();
            }
            if (! Schema::hasColumn('sale_items', 'surcharge_authorized_by')) {
                $table->foreignId('surcharge_authorized_by')->nullable()->constrained('users')->nullOnDelete();
            }
        });
    }

    public function down(): void
    {
        if (Schema::hasColumn('sale_items', 'surcharge_authorized_by')) {
            Schema::table('sale_items', function (Blueprint $table) {
                $table->dropConstrainedForeignId('surcharge_authorized_by');
            });
        }
        Schema::table('sale_items', function (Blueprint $table) {
            foreach (['surcharge_note', 'surcharge_reason', 'surcharge_amount', 'surcharge_value', 'surcharge_basis', 'surcharge_kind'] as $col) {
                if (Schema::hasColumn('sale_items', $col)) {
                    $table->dropColumn($col);
                }
            }
        });
    }
};
