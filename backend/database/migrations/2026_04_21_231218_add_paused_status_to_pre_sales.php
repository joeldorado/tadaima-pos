<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // SQLite doesn't enforce ENUMs and doesn't support MODIFY COLUMN.
        // Application-level validation (FormRequest) handles the constraint there.
        if (DB::getDriverName() !== 'sqlite') {
            DB::statement(
                "ALTER TABLE pre_sales MODIFY COLUMN status
                 ENUM('live','ready','expired','completed','cancelled','paused')
                 NOT NULL DEFAULT 'live'"
            );
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() !== 'sqlite') {
            DB::table('pre_sales')->where('status', 'paused')->update(['status' => 'live']);

            DB::statement(
                "ALTER TABLE pre_sales MODIFY COLUMN status
                 ENUM('live','ready','expired','completed','cancelled')
                 NOT NULL DEFAULT 'live'"
            );
        }
    }
};
