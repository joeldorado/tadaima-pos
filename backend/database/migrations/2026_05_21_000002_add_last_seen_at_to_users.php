<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Adds `users.last_seen_at` para que admin/gerente vean quién está conectado
 * (login activo) aunque todavía no haya abierto su caja registradora.
 *
 * Lo actualiza el middleware `TouchLastSeen` en cada request autenticada,
 * con dedupe interno (no actualiza si se actualizó hace < 30s). El endpoint
 * `GET /users/online?store_id=X` lista usuarios con last_seen_at > now-2min.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->timestamp('last_seen_at')->nullable()->after('avatar_url');
            $table->index('last_seen_at');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropIndex(['last_seen_at']);
            $table->dropColumn('last_seen_at');
        });
    }
};
