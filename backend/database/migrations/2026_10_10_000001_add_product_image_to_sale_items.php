<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Snapshot de la imagen del producto en la línea de venta (2026-10-10, Joel).
 *
 * Mismo espíritu que `product_name`/`product_sku` (2026-08-18) y `cost`
 * (ADR-015): se congela en el checkout y es la verdad histórica de la línea.
 * Antes la imagen se resolvía en vivo contra el catálogo actual — si el
 * producto cambiaba de foto (o se borraba), el historial cambiaba con él.
 *
 * SIN backfill a propósito (Joel 2026-10-10): no le interesa "arreglar" el
 * historial de ventas ya hechas, solo que las VENTAS NUEVAS congelen su
 * imagen desde ahora. Las líneas viejas quedan con `product_image = NULL`
 * y el Resource cae al fallback de siempre (imagen EN VIVO del catálogo,
 * o el ícono de "sin imagen" si ya no hay nada que mostrar) — exactamente
 * el comportamiento que tenían antes de este cambio, cero diferencia.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sale_items', function (Blueprint $table) {
            $table->string('product_image')->nullable()->after('product_sku');
        });
    }

    public function down(): void
    {
        Schema::table('sale_items', function (Blueprint $table) {
            $table->dropColumn('product_image');
        });
    }
};
