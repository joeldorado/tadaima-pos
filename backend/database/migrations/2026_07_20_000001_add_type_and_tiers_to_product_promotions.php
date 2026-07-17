<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Promos v2 — segundo TIPO de promoción (2026-07-20, pedido de Joel):
 *
 *   - 'nxm'          → la NxM de siempre ("compra N, paga M", 2x1).
 *   - 'qty_discount' → "compra N piezas → descuento de $X", con ESCALONES:
 *                      tiers = [{"qty":2,"amount":100},{"qty":3,"amount":400}].
 *                      El motor aplica greedy por grupos (escalón mayor primero
 *                      y se REPITE): 5 pzas con ese ejemplo = 400 + 100 = 500.
 *
 * Regla de exclusividad (se valida en el controller): un producto NO puede
 * tener a la vez una promo 'nxm' y una 'qty_discount' vigentes con ventana y
 * ámbito de tienda encimados — una u otra.
 *
 * buy_n/pay_m pasan a nullable porque solo aplican al tipo 'nxm'.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('product_promotions', function (Blueprint $table) {
            $table->string('type', 20)->default('nxm')->after('name');
            $table->json('tiers')->nullable()->after('pay_m');
            $table->unsignedSmallInteger('buy_n')->nullable()->change();
            $table->unsignedSmallInteger('pay_m')->nullable()->change();
        });
    }

    public function down(): void
    {
        Schema::table('product_promotions', function (Blueprint $table) {
            $table->dropColumn(['type', 'tiers']);
        });
    }
};
