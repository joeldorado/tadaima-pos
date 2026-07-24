<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Promos generales (2026-07-25): una promoción deja de pertenecer a UN producto
 * y pasa a ser una entidad propia asignable a N productos vía este pivote.
 *
 * `product_promotions` se CONSERVA como la tabla de la entidad (no se renombra):
 * sus ids ya viajan en sale_items.applied_promotion_id, en carritos persistidos
 * a localStorage y en promoSignature (cartSync) — re-keying rompería firmas y
 * snapshots. Mismo precedente que el slug 'qty_discount' del mayoreo.
 * Su columna `product_id` queda como rastro legacy (ver migración 000003).
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('product_promotion_assignments')) {
            return;
        }

        Schema::create('product_promotion_assignments', function (Blueprint $table) {
            $table->id();
            $table->foreignId('promotion_id')->constrained('product_promotions')->cascadeOnDelete();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->timestamps();

            // Una promo solo puede estar asignada una vez a cada producto; el
            // unique es también lo que hace idempotente el backfill (000003).
            $table->unique(['promotion_id', 'product_id']);
            $table->index('product_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_promotion_assignments');
    }
};
