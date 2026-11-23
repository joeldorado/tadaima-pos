<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Preventas con Tarjeta y Mixto (2026-11-23, autorizado por Pier).
 *
 * Hasta hoy Caja solo dejaba cobrar una preventa con Efectivo o Transferencia.
 * Ahora también con Tarjeta (y Mixto = efectivo + transferencia), así que cada
 * pago de preventa guarda lo mismo que el pago de una venta:
 *
 *  - `terminal_id` y `commission_amount`: la comisión de la terminal NUNCA se
 *    cobra al cliente, la absorbe la tienda; se guarda para reportes.
 *  - `delivery_id`: una entrega cobrada en Mixto deja DOS pagos. La entrega
 *    (`pre_sale_deliveries.payment_id`) sigue apuntando al primero y aquí
 *    quedan ligados todos, para que «Revertir entrega» los quite juntos.
 *
 * Aditiva e idempotente — corre sola en prod en el deploy. Sin backfill: los
 * pagos anteriores quedan sin terminal, con comisión 0 y sin entrega.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('pre_sale_order_payments', function (Blueprint $table): void {
            if (! Schema::hasColumn('pre_sale_order_payments', 'terminal_id')) {
                $table->foreignId('terminal_id')->nullable()
                    ->constrained('terminals')->nullOnDelete();
            }
            if (! Schema::hasColumn('pre_sale_order_payments', 'commission_amount')) {
                $table->decimal('commission_amount', 12, 2)->default(0);
            }
            if (! Schema::hasColumn('pre_sale_order_payments', 'delivery_id')) {
                $table->foreignId('delivery_id')->nullable()
                    ->constrained('pre_sale_deliveries')->nullOnDelete();
            }
        });
    }

    public function down(): void
    {
        Schema::table('pre_sale_order_payments', function (Blueprint $table): void {
            foreach (['delivery_id', 'terminal_id'] as $fk) {
                if (Schema::hasColumn('pre_sale_order_payments', $fk)) {
                    $table->dropConstrainedForeignId($fk);
                }
            }
            if (Schema::hasColumn('pre_sale_order_payments', 'commission_amount')) {
                $table->dropColumn('commission_amount');
            }
        });
    }
};
