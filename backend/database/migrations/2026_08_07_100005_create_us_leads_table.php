<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// TadaimaUS — leads del sitio US (Joel 2026-08-07): el "We hear you! / Sign Up"
// del Wix original captura emails (newsletter) y la sección de contacto guarda
// nombre + mensaje. Por ahora SOLO se almacenan y se ven en el panel admin;
// el correo de welcome viene después.
//
// source: 'newsletter' | 'contact' — string, no enum (mismo criterio que
// us_orders.status: evolucionar sin ALTER TYPE en Postgres).
//
// Idempotente (hasTable) — corre con `migrate --force` en cada arranque.

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('us_leads')) {
            return;
        }

        Schema::create('us_leads', function (Blueprint $table) {
            $table->id();

            $table->string('source', 20); // newsletter | contact

            $table->string('name', 120)->nullable();
            $table->string('email', 190);
            $table->text('message')->nullable();

            $table->timestamps();

            $table->index('source');
            $table->index('created_at');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('us_leads');
    }
};
