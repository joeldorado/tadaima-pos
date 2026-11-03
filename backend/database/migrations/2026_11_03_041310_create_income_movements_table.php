<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    /**
     * Ingresos (Fase 3): entrada de dinero (venta de equipo, comisiones, devoluciones de
     * proveedor, etc.). Patrón ADR-016: compra de insumo (supply) + entrada de ingresos,
     * ambas vinculadas a cash_movements en una transacción — el corte las cuenta sin
     * duplicar. Solo created_at (como cash_movements: un movimiento no se edita).
     */
    public function up(): void
    {
        Schema::create('income_movements', function (Blueprint $table) {
            $table->id();
            $table->foreignId('register_session_id')->constrained('cash_register_sessions')->cascadeOnDelete();
            // Tienda donde se registra (2026-10-12 pattern): nullable = "toda la empresa"
            $table->foreignId('store_id')->nullable()->constrained('stores')->cascadeOnDelete();
            // Tipo de ingreso: servicio, venta equipo, devolución proveedor, otro
            $table->enum('type', ['service_fee', 'equipment_sale', 'vendor_refund', 'other']);
            // Monto total del ingreso
            $table->decimal('amount', 12, 2);
            // Descripción del ingreso
            $table->string('description', 255)->nullable();
            // FK a cash_movements type='entrada' (la fuente de dinero en el cajón)
            $table->foreignId('cash_movement_id')->nullable()
                ->constrained('cash_movements')->nullOnDelete();
            // Quién registró
            $table->foreignId('user_id')->constrained('users');
            // Auditoría: solo created_at (inmutable)
            $table->timestamp('created_at')->useCurrent();

            $table->index(['register_session_id', 'created_at']);
            $table->index('store_id');
        });
    }

    /**
     * Reverse the migrations.
     */
    public function down(): void
    {
        Schema::dropIfExists('income_movements');
    }
};
