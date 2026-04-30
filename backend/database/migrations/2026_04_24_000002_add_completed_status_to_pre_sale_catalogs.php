<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // SQLite doesn't enforce enum constraints — no-op for dev.
        // MySQL: extend the ENUM column to include 'completed'.
        if (DB::getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE pre_sale_catalogs MODIFY status ENUM('draft','published','arrived','closed','cancelled','completed') NOT NULL DEFAULT 'draft'");
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'mysql') {
            DB::statement("ALTER TABLE pre_sale_catalogs MODIFY status ENUM('draft','published','arrived','closed','cancelled') NOT NULL DEFAULT 'draft'");
        }
    }
};
