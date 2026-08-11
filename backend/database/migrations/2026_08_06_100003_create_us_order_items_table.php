<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// TadaimaUS — líneas de un pedido US.
//
// Cada línea congela name, price_usd y line_total_usd al momento del pedido
// (snapshot, mismo espíritu que ADR-015 cost_at_sale): editar el listing,
// cambiar su precio o borrarlo después NO altera pedidos históricos.
// us_listing_id es nullable + nullOnDelete: si el listing se borra, el pedido
// conserva su nombre y precios congelados.
//
// Idempotente (Schema::hasTable): corre con `migrate --force` en cada arranque
// del contenedor de Cloud Run.

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('us_order_items')) {
            return;
        }

        Schema::create('us_order_items', function (Blueprint $table) {
            $table->id();

            $table->foreignId('us_order_id')
                  ->constrained('us_orders')
                  ->cascadeOnDelete();

            // Referencia viva al listing — null si se despublicó después.
            $table->foreignId('us_listing_id')
                  ->nullable()
                  ->constrained('us_listings')
                  ->nullOnDelete();

            // Snapshot del nombre mostrado al cliente.
            $table->string('name');

            // Precio unitario USD congelado desde us_listings al crear el pedido
            // (JAMÁS del payload del cliente — lo recomputa UsOrderService).
            $table->decimal('price_usd', 10, 2);

            $table->unsignedInteger('quantity');

            // price_usd × quantity, congelado (redondeo a 2 decimales).
            $table->decimal('line_total_usd', 10, 2);

            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('us_order_items');
    }
};
