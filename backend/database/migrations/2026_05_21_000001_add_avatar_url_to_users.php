<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Adds `users.avatar_url` for profile pictures.
 *
 * Convention: the column accepts both kinds of values transparently:
 *  - GCS path (e.g. "profile_pics/12-1747890123.jpg") — uploaded via
 *    POST /users/{id}/avatar. Resolved to absolute URL in UserResource via
 *    Storage::url().
 *  - External URL starting with "http" — set via PUT /users/{id}/avatar/external.
 *    Backend whitelists allowed source domains (PokéAPI, DiceBear) so a
 *    compromised account cannot point avatars to arbitrary trackers.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->string('avatar_url', 500)->nullable()->after('address');
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $table) {
            $table->dropColumn('avatar_url');
        });
    }
};
