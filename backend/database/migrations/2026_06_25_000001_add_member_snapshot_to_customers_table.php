<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// Socio Tadaima: snapshot del estatus que vive en Supabase (solo lectura desde el
// POS). Antes, al importar un socio solo se guardaba name/phone/email y se perdía
// si estaba activo, su nivel de membresía y la vigencia. Se persiste un snapshot
// local para mostrarlo en la ficha y condicionar el precio socio, y se refresca
// contra Supabase cuando se abre/asigna el socio (member_synced_at).
//
// OJO: `nivel_membresia` (ej. "b") NO es el tier de gamificación local
// (Bronce/Plata/Oro/Leyenda). Por eso vive en member_level, separado de loyalty_tier.

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->string('member_status', 20)->nullable()->after('points');   // ACTIVO | INACTIVO
            $table->string('member_level', 20)->nullable()->after('member_status'); // nivel_membresia (ej. "b")
            $table->date('member_expires_at')->nullable()->after('member_level');    // vigencia
            $table->decimal('member_debt', 10, 2)->nullable()->after('member_expires_at'); // adeudo (reservado, sin uso hoy)
            $table->timestamp('member_synced_at')->nullable()->after('member_debt');  // última sync con Supabase
        });
    }

    public function down(): void
    {
        Schema::table('customers', function (Blueprint $table) {
            $table->dropColumn([
                'member_status',
                'member_level',
                'member_expires_at',
                'member_debt',
                'member_synced_at',
            ]);
        });
    }
};
