<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Descuento manual por partida de preventa (2026-11-16, T-003).
 *
 * Al liquidar en Caja, una pieza que llegó dañada (u otro motivo) puede llevar
 * el mismo descuento manual que una venta normal: $ o %, por pieza o por línea,
 * con motivo y nota. Las columnas son el espejo de `sale_items.discount_*`.
 *
 *  - `discount_amount` — monto COMPUTADO por el servidor. El neto de la partida
 *    es `quantity × unit_price − discount_amount`; `unit_price` sigue siendo el
 *    precio pactado (bruto).
 *  - El descuento solo se pone al entregar y nunca supera lo que le falta pagar
 *    a la pieza (no sale dinero de la caja). Revertir la entrega lo quita.
 *
 * Aditiva e idempotente: las partidas existentes quedan con descuento 0.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('pre_sale_order_items', function (Blueprint $table) {
            if (! Schema::hasColumn('pre_sale_order_items', 'discount_kind')) {
                $table->string('discount_kind', 10)->nullable();
            }
            if (! Schema::hasColumn('pre_sale_order_items', 'discount_basis')) {
                $table->string('discount_basis', 10)->nullable();
            }
            if (! Schema::hasColumn('pre_sale_order_items', 'discount_value')) {
                $table->decimal('discount_value', 12, 2)->nullable();
            }
            if (! Schema::hasColumn('pre_sale_order_items', 'discount_amount')) {
                $table->decimal('discount_amount', 12, 2)->default(0);
            }
            if (! Schema::hasColumn('pre_sale_order_items', 'discount_reason')) {
                $table->string('discount_reason', 40)->nullable();
            }
            if (! Schema::hasColumn('pre_sale_order_items', 'discount_note')) {
                $table->string('discount_note', 255)->nullable();
            }
            if (! Schema::hasColumn('pre_sale_order_items', 'discount_authorized_by')) {
                $table->foreignId('discount_authorized_by')->nullable()
                    ->constrained('users')->nullOnDelete();
            }
        });
    }

    public function down(): void
    {
        Schema::table('pre_sale_order_items', function (Blueprint $table) {
            if (Schema::hasColumn('pre_sale_order_items', 'discount_authorized_by')) {
                $table->dropConstrainedForeignId('discount_authorized_by');
            }
            foreach (['discount_kind', 'discount_basis', 'discount_value', 'discount_amount', 'discount_reason', 'discount_note'] as $col) {
                if (Schema::hasColumn('pre_sale_order_items', $col)) {
                    $table->dropColumn($col);
                }
            }
        });
    }
};
