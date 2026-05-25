<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Snapshot del costo en cada item de preventa (folio PREV-XXX).
 *
 *  - Si el catálogo ya tiene `product_id` (mercancía llegada), snap viene de
 *    `products.cost` al crear el folio.
 *  - Si no (catálogo pre-arrival), snap viene de `pre_sale_catalogs.cost`
 *    (costo del proveedor en data maestra). NO se re-snap al vincular product
 *    después — el folio queda con el cost al momento de su creación.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('pre_sale_order_items', function (Blueprint $table) {
            $table->decimal('cost', 12, 2)->nullable()->after('unit_price');
        });
    }

    public function down(): void
    {
        Schema::table('pre_sale_order_items', function (Blueprint $table) {
            $table->dropColumn('cost');
        });
    }
};
