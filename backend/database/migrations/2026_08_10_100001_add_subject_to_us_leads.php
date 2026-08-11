<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// TadaimaUS — asunto del formulario de contacto (Joel 2026-08-10).
// El Wix original pide "Subject *" (con placeholder "e.g., Support") entre el
// email y el mensaje. Se guarda en su propia columna y NO pegado al inicio del
// mensaje: así la bandeja de leads puede mostrarlo, ordenar o filtrar por él
// sin tener que parsear texto libre.
//
// Nullable: los leads del newsletter no tienen asunto, y los de contacto ya
// capturados tampoco — no se les puede inventar uno.
//
// Idempotente (hasColumn) — corre con `migrate --force` en cada arranque.

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('us_leads') || Schema::hasColumn('us_leads', 'subject')) {
            return;
        }

        Schema::table('us_leads', function (Blueprint $table) {
            $table->string('subject', 150)->nullable()->after('email');
        });
    }

    public function down(): void
    {
        if (! Schema::hasColumn('us_leads', 'subject')) {
            return;
        }

        Schema::table('us_leads', function (Blueprint $table) {
            $table->dropColumn('subject');
        });
    }
};
