<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// TadaimaUS — cuentas de CLIENTE de la tienda US (Joel/Pier 2026-08-12).
// Separadas por completo de los users del POS (RBAC) y del Customer del POS MX
// (créditos/puntos): el cliente US se registra EN EL CHECKOUT (contraseña
// obligatoria, sin verificación de correo) y entra a "My Orders" al instante.
// Login de regreso: email O teléfono + contraseña — por eso `phone` se guarda
// NORMALIZADO a solo dígitos (el formato bonito vive en el snapshot del order).
// La dirección aquí es la "default" que pre-llena el checkout; cada pedido
// congela la suya en us_orders.shipping_*.
//
// Idempotente (hasTable) — corre con `migrate --force` en cada arranque.

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('us_customers')) {
            return;
        }

        Schema::create('us_customers', function (Blueprint $table) {
            $table->id();
            $table->string('name', 120);
            $table->string('email', 190)->unique();
            $table->string('phone', 30)->index();
            $table->string('password');
            $table->string('address', 190)->nullable();
            $table->string('city', 120)->nullable();
            $table->string('state', 60)->nullable();
            $table->string('zip', 20)->nullable();
            $table->string('country', 60)->nullable()->default('United States');
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('us_customers');
    }
};
