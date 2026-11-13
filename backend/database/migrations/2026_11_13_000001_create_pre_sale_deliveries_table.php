<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Entregas de preventa (2026-11-13, caso de tienda: folio de 3 productos y
 * solo llegaron 2).
 *
 * Cada vez que Caja entrega partidas de un folio se guarda UNA fila aquí con el
 * pago que las liquidó (`payment_id`, null si la entrega fue de $0 porque el
 * anticipo ya cubría). Las partidas apuntan a su entrega con `delivery_id`.
 * Con eso:
 *  - «Revertir» deshace exactamente la última entrega y SU pago (antes borraba
 *    «el último pago», que podía ser el anticipo).
 *  - El reporte sabe qué pago liquidó qué partida cuando un folio se entrega
 *    en dos visitas.
 *
 * `sale_cancellations.payment_snapshot` guarda el pago borrado por una reversa
 * (monto, método, cajero, fecha): antes solo quedaba el monto.
 *
 * Aditiva e idempotente — corre sola en prod en el deploy. Sin backfill: los
 * folios anteriores quedan con `delivery_id` NULL y se comportan como siempre.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('pre_sale_deliveries')) {
            Schema::create('pre_sale_deliveries', function (Blueprint $table): void {
                $table->id();
                $table->foreignId('pre_sale_order_id')->constrained('pre_sale_orders')->cascadeOnDelete();
                $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
                // Pago que liquidó esta entrega; null = entrega sin cobro.
                $table->foreignId('payment_id')->nullable()
                    ->constrained('pre_sale_order_payments')->nullOnDelete();
                $table->decimal('amount', 12, 2)->default(0);
                $table->timestamp('reverted_at')->nullable();
                $table->foreignId('reverted_by')->nullable()->constrained('users')->nullOnDelete();
                $table->timestamps();

                $table->index(['pre_sale_order_id', 'reverted_at'], 'psd_order_reverted_idx');
            });
        }

        if (! Schema::hasColumn('pre_sale_order_items', 'delivery_id')) {
            Schema::table('pre_sale_order_items', function (Blueprint $table): void {
                $table->foreignId('delivery_id')->nullable()
                    ->constrained('pre_sale_deliveries')->nullOnDelete();
            });
        }

        if (! Schema::hasColumn('sale_cancellations', 'payment_snapshot')) {
            Schema::table('sale_cancellations', function (Blueprint $table): void {
                $table->json('payment_snapshot')->nullable();
            });
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('sale_cancellations', 'payment_snapshot')) {
            Schema::table('sale_cancellations', function (Blueprint $table): void {
                $table->dropColumn('payment_snapshot');
            });
        }

        if (Schema::hasColumn('pre_sale_order_items', 'delivery_id')) {
            Schema::table('pre_sale_order_items', function (Blueprint $table): void {
                $table->dropConstrainedForeignId('delivery_id');
            });
        }

        Schema::dropIfExists('pre_sale_deliveries');
    }
};
