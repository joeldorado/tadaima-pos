<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Fecha de negocio del corte mandada por la UI al cerrar caja (zona LOCAL del
 * dispositivo del cajero). Los timestamps opened_at/closed_at siguen en UTC;
 * esta columna fija a qué día pertenece el corte sin ambigüedad de zona
 * (Joel 2026-06-11: corte a las 11:30pm Tijuana guardaba closed_at del día 12).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('cash_register_sessions', function (Blueprint $table) {
            $table->date('local_date')->nullable()->after('closed_at')->index();
        });
    }

    public function down(): void
    {
        Schema::table('cash_register_sessions', function (Blueprint $table) {
            $table->dropIndex(['local_date']);
            $table->dropColumn('local_date');
        });
    }
};
