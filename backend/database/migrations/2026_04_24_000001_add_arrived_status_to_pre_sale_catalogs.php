<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    private const ALL_STATUSES      = ['draft', 'published', 'arrived', 'closed', 'cancelled'];
    private const ORIGINAL_STATUSES = ['draft', 'published', 'closed', 'cancelled'];

    public function up(): void
    {
        if (DB::getDriverName() === 'sqlite') {
            $this->recreateForSqlite(self::ALL_STATUSES, includeArrived: true);
        } else {
            $enum = implode(',', array_map(fn ($s) => "'$s'", self::ALL_STATUSES));
            DB::statement("ALTER TABLE pre_sale_catalogs MODIFY COLUMN status ENUM({$enum}) NOT NULL DEFAULT 'draft'");
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'sqlite') {
            $this->recreateForSqlite(self::ORIGINAL_STATUSES, includeArrived: false);
        } else {
            $enum = implode(',', array_map(fn ($s) => "'$s'", self::ORIGINAL_STATUSES));
            DB::statement("ALTER TABLE pre_sale_catalogs MODIFY COLUMN status ENUM({$enum}) NOT NULL DEFAULT 'draft'");
        }
    }

    private function recreateForSqlite(array $statuses, bool $includeArrived): void
    {
        DB::statement('PRAGMA foreign_keys = OFF');
        DB::statement('ALTER TABLE pre_sale_catalogs RENAME TO pre_sale_catalogs_old');

        $checkList = implode("','", $statuses);
        DB::statement("
            CREATE TABLE pre_sale_catalogs (
                id               INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                category_id      INTEGER REFERENCES product_categories(id) ON DELETE SET NULL,
                supplier_id      INTEGER REFERENCES suppliers(id) ON DELETE SET NULL,
                product_id       INTEGER REFERENCES products(id) ON DELETE SET NULL,
                created_by       INTEGER REFERENCES users(id) ON DELETE SET NULL,
                product_name     VARCHAR NOT NULL,
                image_path       VARCHAR,
                cost             NUMERIC(12,2),
                margin_percent   NUMERIC(5,2),
                price_1          NUMERIC(12,2),
                price_2          NUMERIC(12,2),
                price_3          NUMERIC(12,2),
                price_4          NUMERIC(12,2),
                price_5          NUMERIC(12,2),
                advance_payment  NUMERIC(12,2) NOT NULL DEFAULT 0,
                preorder_limit   INTEGER UNSIGNED,
                arrival_date     DATE,
                pickup_deadline  DATE,
                status           VARCHAR NOT NULL DEFAULT 'draft'
                                 CHECK(status IN ('{$checkList}')),
                created_at       DATETIME,
                updated_at       DATETIME
            )
        ");

        if ($includeArrived) {
            DB::statement('INSERT INTO pre_sale_catalogs SELECT * FROM pre_sale_catalogs_old');
        } else {
            DB::statement("INSERT INTO pre_sale_catalogs SELECT * FROM pre_sale_catalogs_old WHERE status != 'arrived'");
        }

        DB::statement('DROP TABLE pre_sale_catalogs_old');
        DB::statement('CREATE INDEX IF NOT EXISTS pre_sale_catalogs_status_index ON pre_sale_catalogs(status)');
        DB::statement('CREATE INDEX IF NOT EXISTS pre_sale_catalogs_status_category_id_index ON pre_sale_catalogs(status, category_id)');
        DB::statement('PRAGMA foreign_keys = ON');
    }
};
