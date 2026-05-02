<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // Skip if no company exists yet — seeder handles this after companies are created.
        $companyId = DB::table('companies')->value('id');
        if (!$companyId) {
            return;
        }

        DB::table('system_settings')->upsert(
            [['company_id' => $companyId, 'key' => 'points_multiplier', 'value' => '0.001']],
            ['company_id', 'key'],
            ['value']
        );
    }

    public function down(): void
    {
        DB::table('system_settings')->where('key', 'points_multiplier')->delete();
    }
};
