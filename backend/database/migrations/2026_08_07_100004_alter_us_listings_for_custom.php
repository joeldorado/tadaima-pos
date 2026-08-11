<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// TadaimaUS — listings CUSTOM (Joel 2026-08-07): la tienda US también vende
// productos que NO existen en el POS (los 42 migrados del Wix original +
// altas dummy del panel). product_id pasa a nullable — null = listing custom
// con nombre/precio/foto propios. El unique se conserva (Postgres/SQLite
// permiten múltiples NULL en un unique).
//
// slug: identidad del import del Wix (`tadaima:import-us-catalog` upserta por
// slug — re-correrlo no duplica). Null en listings creados a mano.
//
// Idempotente (hasColumn) — corre con `migrate --force` en cada arranque.

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('us_listings')) {
            return;
        }

        if (! Schema::hasColumn('us_listings', 'slug')) {
            Schema::table('us_listings', function (Blueprint $table) {
                $table->string('slug', 160)->nullable()->unique()->after('product_id');
            });
        }

        Schema::table('us_listings', function (Blueprint $table) {
            $table->unsignedBigInteger('product_id')->nullable()->change();
        });
    }

    public function down(): void
    {
        if (! Schema::hasTable('us_listings')) {
            return;
        }

        Schema::table('us_listings', function (Blueprint $table) {
            $table->dropColumn('slug');
        });
    }
};
