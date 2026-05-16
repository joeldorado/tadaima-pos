<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * FULLTEXT index on products(name, sku, barcode). Drops the LIKE table scan
 * (~200ms on 8k rows) and replaces it with index-backed MATCH AGAINST
 * (~5-10ms). The scopeSearch on Product uses MATCH AGAINST when term is
 * >= 3 chars and falls back to LIKE for shorter terms (FULLTEXT default
 * min token size is 3).
 *
 * SQLite (used in unit tests) doesn't support FULLTEXT, so the migration
 * is a no-op there — tests keep using LIKE.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() !== 'mysql') {
            return;
        }
        Schema::table('products', function ($table) {
            $table->fullText(['name', 'sku', 'barcode'], 'products_search_fulltext');
        });
    }

    public function down(): void
    {
        if (DB::getDriverName() !== 'mysql') {
            return;
        }
        Schema::table('products', function ($table) {
            $table->dropFullText('products_search_fulltext');
        });
    }
};
