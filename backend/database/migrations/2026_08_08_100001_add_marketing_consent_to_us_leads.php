<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// TadaimaUS — consentimiento de marketing en el newsletter (Joel 2026-08-08).
// El Wix original tiene el checkbox "I want to subscribe to your mailing list"
// junto al Sign Up; sin guardarlo no hay forma de probar quién aceptó recibir
// correos, que es justo lo que exige cualquier plataforma de email marketing.
//
// Default false: los leads YA capturados no otorgaron consentimiento explícito
// y no se les puede asumir.
//
// Idempotente (hasColumn) — corre con `migrate --force` en cada arranque.

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('us_leads') || Schema::hasColumn('us_leads', 'marketing_consent')) {
            return;
        }

        Schema::table('us_leads', function (Blueprint $table) {
            $table->boolean('marketing_consent')->default(false);
        });
    }

    public function down(): void
    {
        if (! Schema::hasColumn('us_leads', 'marketing_consent')) {
            return;
        }

        Schema::table('us_leads', function (Blueprint $table) {
            $table->dropColumn('marketing_consent');
        });
    }
};
