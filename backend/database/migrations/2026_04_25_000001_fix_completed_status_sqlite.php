<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() !== 'sqlite') {
            return;
        }

        DB::statement("PRAGMA writable_schema = ON");
        DB::statement("
            UPDATE sqlite_master
            SET sql = REPLACE(
                sql,
                \"'draft','published','arrived','closed','cancelled'\",
                \"'draft','published','arrived','closed','cancelled','completed'\"
            )
            WHERE type = 'table' AND name = 'pre_sale_catalogs'
        ");
        DB::statement("PRAGMA writable_schema = OFF");
        DB::statement("PRAGMA integrity_check");
    }

    public function down(): void
    {
        if (DB::getDriverName() !== 'sqlite') {
            return;
        }

        DB::statement("PRAGMA writable_schema = ON");
        DB::statement("
            UPDATE sqlite_master
            SET sql = REPLACE(
                sql,
                \"'draft','published','arrived','closed','cancelled','completed'\",
                \"'draft','published','arrived','closed','cancelled'\"
            )
            WHERE type = 'table' AND name = 'pre_sale_catalogs'
        ");
        DB::statement("PRAGMA writable_schema = OFF");
        DB::statement("PRAGMA integrity_check");
    }
};
