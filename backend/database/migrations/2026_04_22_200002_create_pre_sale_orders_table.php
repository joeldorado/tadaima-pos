<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// ADR-010: Folio de venta preventa — creado por el cajero cuando un cliente aparta.
// customer_id es NOT NULL por diseño: no existe un folio sin cliente.
// Un folio puede contener ítems de múltiples catálogos distintos.
// paid_amount y balance son atributos computados en el modelo Eloquent
// (suma de pre_sale_order_payments), consistente con el patrón de Layaway y PreSale.

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pre_sale_orders', function (Blueprint $table) {
            $table->id();

            // Folio único — formato PREV-00001
            $table->string('code')->unique();

            // Relaciones core — ninguna nullable a propósito:
            // un folio sin tienda, cajero o cliente no tiene sentido de negocio
            $table->foreignId('store_id')->constrained('stores');
            $table->foreignId('user_id')->constrained('users');      // cajero
            $table->foreignId('customer_id')->constrained('customers');

            // pending  → anticipo pagado, mercancía no llegó
            // ready    → admin activó (mercancía llegó), cajero puede liquidar
            // delivered→ liquidado y entregado al cliente
            // expired  → pickup_deadline pasó sin liquidar
            // cancelled→ cancelado
            $table->enum('status', ['pending', 'ready', 'delivered', 'expired', 'cancelled'])
                  ->default('pending');

            // Fecha límite para recoger (copiada del catálogo al confirmar ready)
            $table->date('pickup_deadline')->nullable();

            $table->text('notes')->nullable();

            $table->timestamps();

            // Índices para los filtros más frecuentes de la caja:
            $table->index(['status', 'store_id']);   // "órdenes ready de mi tienda"
            $table->index(['customer_id', 'status']); // historial de un cliente
            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('pre_sale_orders');
    }
};
