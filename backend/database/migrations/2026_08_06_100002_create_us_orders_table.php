<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// TadaimaUS — pedidos del checkout dummy de la tienda US.
//
// El checkout NO cobra: captura nombre/correo/teléfono del cliente y genera un
// folio TUS-000001 (secuencial por id, dentro de una transacción). El equipo
// contacta al cliente a mano. total_usd es snapshot server-side (suma de
// us_order_items) — JAMÁS viene del cliente.
//
// status es string (no enum) a propósito: portable Postgres/SQLite y ampliable
// sin migración. Default 'new'.
//
// Idempotente (Schema::hasTable): corre con `migrate --force` en cada arranque
// del contenedor de Cloud Run.

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('us_orders')) {
            return;
        }

        Schema::create('us_orders', function (Blueprint $table) {
            $table->id();

            // Folio único — formato TUS-000001.
            $table->string('order_number')->unique();

            // Datos de contacto capturados en el checkout (sin cuenta de cliente).
            $table->string('customer_name', 120);
            $table->string('customer_email', 190);
            $table->string('customer_phone', 30);

            // Snapshot del total en dólares al momento del pedido.
            $table->decimal('total_usd', 10, 2);

            $table->string('status')->default('new');

            $table->timestamps();

            $table->index('status');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('us_orders');
    }
};
