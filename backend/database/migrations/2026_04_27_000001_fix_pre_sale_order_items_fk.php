<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

return new class extends Migration
{
    public function up(): void
    {
        // SQLite auto-updated the FK in pre_sale_order_items when migration
        // 000001 renamed pre_sale_catalogs → pre_sale_catalogs_old, leaving a
        // broken reference after the old table was dropped.  Recreate the table
        // with the correct FK.  MySQL is unaffected (uses ALTER TABLE, no rename).
        if (DB::getDriverName() !== 'sqlite') {
            return;
        }

        DB::statement('PRAGMA foreign_keys = OFF');

        DB::statement('ALTER TABLE pre_sale_order_items RENAME TO pre_sale_order_items_old');

        DB::statement('
            CREATE TABLE pre_sale_order_items (
                id                  INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                pre_sale_order_id   INTEGER NOT NULL
                                    REFERENCES pre_sale_orders(id) ON DELETE CASCADE,
                pre_sale_catalog_id INTEGER NOT NULL
                                    REFERENCES pre_sale_catalogs(id) ON DELETE RESTRICT,
                product_id          INTEGER
                                    REFERENCES products(id) ON DELETE SET NULL,
                quantity            INTEGER NOT NULL,
                price_level         INTEGER NOT NULL DEFAULT 1,
                unit_price          NUMERIC NOT NULL,
                status              VARCHAR NOT NULL DEFAULT \'pending\'
                                    CHECK(status IN (\'pending\', \'delivered\')),
                delivered_at        DATETIME,
                created_at          DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
        ');

        DB::statement('INSERT INTO pre_sale_order_items SELECT * FROM pre_sale_order_items_old');
        DB::statement('DROP TABLE pre_sale_order_items_old');

        DB::statement('CREATE INDEX IF NOT EXISTS pre_sale_order_items_pre_sale_catalog_id_status_index ON pre_sale_order_items (pre_sale_catalog_id, status)');

        DB::statement('PRAGMA foreign_keys = ON');
    }

    public function down(): void
    {
        // Intentionally left as no-op: reverting would restore the broken FK.
    }
};
