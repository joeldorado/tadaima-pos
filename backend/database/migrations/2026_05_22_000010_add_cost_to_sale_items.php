<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Snapshot del costo del producto al momento EXACTO del INSERT del sale_item.
 *
 * Resuelve el bug de reportes históricos: `products.cost` muta en el tiempo
 * (admin re-precia), y leer ese valor en reportes pasados produce ganancias
 * brutas falsas. `sale_items.cost` se llena en CheckoutService al crear cada
 * fila y queda inmutable después de eso.
 *
 *  - NULL = venta histórica anterior a esta migración (cost desconocido).
 *  - NO usar `products.cost` como fallback en agregados — esta columna existe
 *    exactamente para evitar esa lectura tóxica.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sale_items', function (Blueprint $table) {
            $table->decimal('cost', 12, 2)->nullable()->after('total');
        });
    }

    public function down(): void
    {
        Schema::table('sale_items', function (Blueprint $table) {
            $table->dropColumn('cost');
        });
    }
};
