<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Snapshot del costo en cada apartado.
 *
 * El apartado descuenta inventario al crearse (reserva física del producto),
 * por eso el cost se snap al crear, no al entregar. Cuando el apartado se
 * entrega, el SaleItem generado hereda este cost (cadena de snaps), no el
 * `products.cost` actual.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('layaways', function (Blueprint $table) {
            $table->decimal('cost', 12, 2)->nullable()->after('total');
        });
    }

    public function down(): void
    {
        Schema::table('layaways', function (Blueprint $table) {
            $table->dropColumn('cost');
        });
    }
};
