<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Copia reversible del password para que el ADMIN pueda verla en users
 * settings (feedback cliente 2026-06-24). El modelo la cifra con el cast
 * 'encrypted' (AES con APP_KEY). El login sigue usando el bcrypt de `password`;
 * esta columna es solo para consulta del admin. Nullable: los usuarios creados
 * antes de este cambio quedan sin copia (solo hash) hasta que se les resetee.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            if (! Schema::hasColumn('users', 'password_enc')) {
                $table->text('password_enc')->nullable()->after('password');
            }
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table): void {
            if (Schema::hasColumn('users', 'password_enc')) {
                $table->dropColumn('password_enc');
            }
        });
    }
};
