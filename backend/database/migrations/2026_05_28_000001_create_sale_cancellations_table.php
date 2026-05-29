<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * ADR-016 — Sistema de cancelación de ventas (edit-in-place + log table).
 *
 * - Agrega `cancellation_status` + `last_cancelled_at` a `sales` y `pre_sale_orders`.
 * - Crea tabla `sale_cancellations` con snapshot JSON de items cancelados,
 *   motivo, monto reversado, link al cash_movement de salida y a la sesión
 *   donde se procesó (para corte del día).
 *
 * El snapshot conserva cost_at_sale (ADR-015) para que reportes históricos
 * de ganancia bruta sean recalculables sin perder data al editar la venta.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('sales', function (Blueprint $table) {
            $table->string('cancellation_status', 16)->default('none')->after('status');
            $table->timestamp('last_cancelled_at')->nullable()->after('cancellation_status');
        });

        Schema::table('pre_sale_orders', function (Blueprint $table) {
            $table->string('cancellation_status', 16)->default('none')->after('status');
            $table->timestamp('last_cancelled_at')->nullable()->after('cancellation_status');
        });

        Schema::create('sale_cancellations', function (Blueprint $table) {
            $table->id();
            $table->foreignId('sale_id')->nullable()->constrained()->nullOnDelete();
            $table->foreignId('pre_sale_order_id')->nullable()->constrained()->nullOnDelete();
            // Modo: full (ticket entero), partial_items (items específicos),
            // liquidation_rollback (preventa delivered → ready, reversa pago liquidación).
            $table->string('mode', 32);
            // Motivo predefinido + texto libre opcional.
            $table->string('reason_code', 32);
            $table->text('reason_text')->nullable();
            $table->decimal('amount_refunded', 12, 2)->default(0);
            // Movimiento de caja generado (salida); nullable porque puede haber
            // cancelaciones administrativas sin reflejo monetario inmediato.
            $table->foreignId('cash_movement_id')->nullable()->constrained('cash_movements')->nullOnDelete();
            // Sesión donde se PROCESÓ la cancelación (no necesariamente la
            // sesión original de la venta — puede ser días después).
            $table->foreignId('cash_session_id')->nullable()->constrained('cash_register_sessions')->nullOnDelete();
            // Snapshot inmutable de lo cancelado. Cada item:
            // {sale_item_id, product_id, name, sku, qty_cancelled, price, cost, line_total}
            // Preserva ADR-015 cost_at_sale aunque se edite/borre sale_items.
            $table->json('items_snapshot');
            $table->foreignId('cancelled_by')->constrained('users');
            $table->timestamp('cancelled_at')->useCurrent();

            $table->index(['sale_id', 'cancelled_at']);
            $table->index(['pre_sale_order_id', 'cancelled_at']);
            $table->index(['cancelled_by', 'cancelled_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('sale_cancellations');

        Schema::table('pre_sale_orders', function (Blueprint $table) {
            $table->dropColumn(['cancellation_status', 'last_cancelled_at']);
        });

        Schema::table('sales', function (Blueprint $table) {
            $table->dropColumn(['cancellation_status', 'last_cancelled_at']);
        });
    }
};
