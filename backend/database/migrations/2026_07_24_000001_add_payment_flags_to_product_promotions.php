<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Restricción de método de pago POR PROMOCIÓN (2026-07-24).
 *
 * Espejo de `product_payment_methods` (2026_04_09_000011), que hace lo mismo a
 * nivel producto. Una promo puede ser solo-efectivo o solo-tarjeta; si el
 * método de cobro no le sirve, **bloquea el cobro** igual que hoy lo hace la
 * restricción del producto (decisión de Joel: no "se cae el descuento").
 *
 * Default true en ambas para que todas las promos existentes sigan aplicando
 * con cualquier método — el cambio es puramente aditivo.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('product_promotions', function (Blueprint $table) {
            if (!Schema::hasColumn('product_promotions', 'allow_cash')) {
                $table->boolean('allow_cash')->default(true)->after('discount_per_unit');
            }
            if (!Schema::hasColumn('product_promotions', 'allow_card')) {
                $table->boolean('allow_card')->default(true)->after('allow_cash');
            }
        });
    }

    public function down(): void
    {
        Schema::table('product_promotions', function (Blueprint $table) {
            foreach (['allow_card', 'allow_cash'] as $col) {
                if (Schema::hasColumn('product_promotions', $col)) {
                    $table->dropColumn($col);
                }
            }
        });
    }
};
