<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // SQLite doesn't enforce enum constraints — no-op for dev.
        // MySQL: extend the ENUM column to include 'completed'.
        // Postgres (Supabase 2026-07-30): el "enum" es varchar + CHECK — sin esta
        // rama el CHECK quedaba SIN 'completed' → check_violation al completar
        // un catálogo en producción.
        $driver = DB::getDriverName();
        if ($driver === 'mysql') {
            DB::statement("ALTER TABLE pre_sale_catalogs MODIFY status ENUM('draft','published','arrived','closed','cancelled','completed') NOT NULL DEFAULT 'draft'");
        } elseif ($driver === 'pgsql') {
            $this->recreateCheckForPgsql(['draft', 'published', 'arrived', 'closed', 'cancelled', 'completed']);
        }
    }

    public function down(): void
    {
        $driver = DB::getDriverName();
        if ($driver === 'mysql') {
            DB::statement("ALTER TABLE pre_sale_catalogs MODIFY status ENUM('draft','published','arrived','closed','cancelled') NOT NULL DEFAULT 'draft'");
        } elseif ($driver === 'pgsql') {
            $this->recreateCheckForPgsql(['draft', 'published', 'arrived', 'closed', 'cancelled']);
        }
    }

    private function recreateCheckForPgsql(array $statuses): void
    {
        $list = implode(', ', array_map(fn ($s) => "'$s'::text", $statuses));
        DB::statement('ALTER TABLE pre_sale_catalogs DROP CONSTRAINT IF EXISTS pre_sale_catalogs_status_check');
        DB::statement("ALTER TABLE pre_sale_catalogs ADD CONSTRAINT pre_sale_catalogs_status_check CHECK (status::text = ANY (ARRAY[{$list}]))");
    }
};
