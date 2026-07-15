<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Insumos (Descuentos v2 — Fase 2, M5): catálogo de insumos de operación
 * (cinta, bolsas, papelería…) + movimientos con costo.
 *
 * Una compra pagada con efectivo de la caja crea, EN LA MISMA transacción,
 * un `cash_movements type='salida'` linkeado vía `cash_movement_id` (patrón
 * ADR-016 del reverso de cancelaciones). Como el corte ya resta TODAS las
 * salidas en expected_cash, la compra se auto-balancea — el bloque de insumos
 * en reportes es drill-down informativo, nunca se re-resta.
 *
 * `consumption`/`adjustment` son para control de stock/costo del insumo y NO
 * tocan caja (cash_movement_id NULL, amount 0 en consumo).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('supplies', function (Blueprint $table) {
            $table->id();
            $table->foreignId('company_id')->constrained('companies')->cascadeOnDelete();
            $table->string('name', 100);
            $table->string('category', 50)->nullable();
            $table->string('unit', 20)->nullable();
            $table->boolean('is_active')->default(true);
            $table->timestamps();
        });

        Schema::create('supply_movements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('supply_id')->constrained('supplies')->cascadeOnDelete();
            $table->enum('type', ['purchase', 'consumption', 'adjustment']);
            $table->decimal('quantity', 12, 2);
            // Costo total del movimiento (qty × costo unitario). Solo compras.
            $table->decimal('amount', 12, 2)->default(0);
            $table->string('note', 255)->nullable();
            $table->foreignId('register_session_id')->nullable()
                ->constrained('cash_register_sessions')->nullOnDelete();
            $table->foreignId('cash_movement_id')->nullable()
                ->constrained('cash_movements')->nullOnDelete();
            $table->foreignId('user_id')->constrained('users');
            $table->timestamp('created_at')->useCurrent();

            $table->index(['supply_id', 'created_at']);
            $table->index('register_session_id');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('supply_movements');
        Schema::dropIfExists('supplies');
    }
};
