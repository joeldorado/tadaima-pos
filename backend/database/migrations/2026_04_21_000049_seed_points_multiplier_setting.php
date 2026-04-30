<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Guard: do nothing in SQLite test environments where company_id is
        // required by the unique(['company_id','key']) constraint and no
        // company row exists yet at migration time.
        if (DB::getDriverName() === 'sqlite') {
            return;
        }

        DB::table('system_settings')->upsert(
            [['key' => 'points_multiplier', 'value' => '0.001']],
            ['key'],
            ['value']
        );
    }

    public function down(): void
    {
        DB::table('system_settings')->where('key', 'points_multiplier')->delete();
    }
};
