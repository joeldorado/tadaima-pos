<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Descuentos v2 — Fase 1 (M1): beneficio POR LÍNEA en sale_items.
 *
 * Reemplaza al descuento global de la venta (sales.discount como monto suelto
 * capturado en caja) por un modelo donde cada línea lleva su propio beneficio:
 *  - `benefit_type`  — 'discount' (manual de caja: unidades dañadas, cortesía…)
 *                      o 'promo' (NxM, llega en Fase 3). NULL = precio completo.
 *  - `discount_*`    — captura del cajero: tipo ($/%), base (unidad/línea),
 *                      valor tecleado, motivo, nota y quién lo autorizó.
 *  - `discount_amount` — monto COMPUTADO server-side por SaleCalculator
 *                      (auditoría; siempre recalculable desde kind/basis/value).
 *  - `applied_promotion_id` + `promo_name`/`promo_free_qty` — snapshot de la
 *                      promo aplicada (espíritu ADR-015: la promo puede
 *                      editarse/borrarse después, el ticket histórico no).
 *
 * Invariante que se conserva: `sale_items.total` sigue siendo BRUTO (qty×price)
 * y `sales.discount` pasa a ser el rollup Σ discount_amount (+ cupón en Fase 4),
 * de modo que `sales.total = subtotal − discount` sigue valiendo para TODOS los
 * reportes, ventas viejas y nuevas.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('sale_items', function (Blueprint $table) {
            $table->enum('benefit_type', ['discount', 'promo'])->nullable()->after('cost');
            $table->enum('discount_kind', ['fixed', 'percent'])->nullable()->after('benefit_type');
            $table->enum('discount_basis', ['unit', 'line'])->nullable()->after('discount_kind');
            $table->decimal('discount_value', 12, 2)->nullable()->after('discount_basis');
            $table->decimal('discount_amount', 12, 2)->default(0)->after('discount_value');
            $table->string('discount_reason', 40)->nullable()->after('discount_amount');
            $table->string('discount_note', 255)->nullable()->after('discount_reason');
            $table->foreignId('discount_authorized_by')->nullable()->after('discount_note')
                ->constrained('users')->nullOnDelete();
            // FK real a product_promotions llega con la tabla en Fase 3; por ahora
            // columna suelta para no romper el orden de deploys.
            $table->unsignedBigInteger('applied_promotion_id')->nullable()->after('discount_authorized_by');
            $table->string('promo_name', 100)->nullable()->after('applied_promotion_id');
            $table->unsignedInteger('promo_free_qty')->nullable()->after('promo_name');
        });
    }

    public function down(): void
    {
        Schema::table('sale_items', function (Blueprint $table) {
            $table->dropConstrainedForeignId('discount_authorized_by');
            $table->dropColumn([
                'benefit_type',
                'discount_kind',
                'discount_basis',
                'discount_value',
                'discount_amount',
                'discount_reason',
                'discount_note',
                'applied_promotion_id',
                'promo_name',
                'promo_free_qty',
            ]);
        });
    }
};
