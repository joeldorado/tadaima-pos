<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Snapshot del MONTO de la parte promo por línea (2026-07-20).
 *
 * Antes el monto de la promo se DERIVABA (promo_free_qty × price) — válido
 * solo para NxM. Con el tipo 'qty_discount' (descuento fijo por cantidad) esa
 * derivación no existe, así que se congela el monto directo:
 *
 *   promo_amount = parte promo del discount_amount de la línea
 *   parte manual = discount_amount − promo_amount
 *
 * Ventas nuevas (ambos tipos) lo llenan siempre; lectores hacen fallback
 * legacy `promo_free_qty × price` para ventas anteriores (promo_amount NULL).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sale_items', function (Blueprint $table) {
            $table->decimal('promo_amount', 10, 2)->nullable()->after('promo_free_qty');
        });
    }

    public function down(): void
    {
        Schema::table('sale_items', function (Blueprint $table) {
            $table->dropColumn('promo_amount');
        });
    }
};
