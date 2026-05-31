<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Modelo "una caja por persona" (ADR-017, 2026-05-30).
 *
 * Cada usuario tiene su propia caja registradora (sesión = caja). `owner_user_id`
 * marca de quién es. Las cajas existentes (compartidas / legacy "Caja 1") quedan
 * con owner null y se siguen pudiendo usar, pero las nuevas aperturas crean/usan
 * la caja personal del usuario, nombrada "{usuario} · {tienda}".
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('cash_registers', function (Blueprint $table) {
            $table->foreignId('owner_user_id')
                  ->nullable()
                  ->after('store_id')
                  ->constrained('users')
                  ->nullOnDelete();
            $table->index(['store_id', 'owner_user_id']);
        });
    }

    public function down(): void
    {
        Schema::table('cash_registers', function (Blueprint $table) {
            $table->dropIndex(['store_id', 'owner_user_id']);
            $table->dropConstrainedForeignId('owner_user_id');
        });
    }
};
