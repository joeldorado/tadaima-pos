<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // SQLite doesn't enforce ENUMs and doesn't support MODIFY COLUMN.
        // Application-level validation (FormRequest) handles the constraint there.
        // (La tabla pre_sales se BORRA en 2026_05_15_000001 — esta migración solo
        // debe PASAR limpiamente en un migrate fresco en cualquier driver.)
        $driver = DB::getDriverName();
        if ($driver === 'pgsql') {
            $this->recreateCheckForPgsql(['live', 'ready', 'expired', 'completed', 'cancelled', 'paused']);
        } elseif ($driver !== 'sqlite') {
            DB::statement(
                "ALTER TABLE pre_sales MODIFY COLUMN status
                 ENUM('live','ready','expired','completed','cancelled','paused')
                 NOT NULL DEFAULT 'live'"
            );
        }
    }

    public function down(): void
    {
        $driver = DB::getDriverName();
        if ($driver === 'sqlite') {
            return;
        }

        DB::table('pre_sales')->where('status', 'paused')->update(['status' => 'live']);

        if ($driver === 'pgsql') {
            $this->recreateCheckForPgsql(['live', 'ready', 'expired', 'completed', 'cancelled']);
        } else {
            DB::statement(
                "ALTER TABLE pre_sales MODIFY COLUMN status
                 ENUM('live','ready','expired','completed','cancelled')
                 NOT NULL DEFAULT 'live'"
            );
        }
    }

    private function recreateCheckForPgsql(array $statuses): void
    {
        $list = implode(', ', array_map(fn ($s) => "'$s'::text", $statuses));
        DB::statement('ALTER TABLE pre_sales DROP CONSTRAINT IF EXISTS pre_sales_status_check');
        DB::statement("ALTER TABLE pre_sales ADD CONSTRAINT pre_sales_status_check CHECK (status::text = ANY (ARRAY[{$list}]))");
    }
};
