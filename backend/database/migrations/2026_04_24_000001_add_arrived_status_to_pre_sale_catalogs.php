<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // SQLite no soporta ALTER COLUMN, así que recreamos la tabla con el
        // nuevo valor de enum (arrived) preservando todos los datos existentes.
        DB::statement('PRAGMA foreign_keys = OFF');

        DB::statement('ALTER TABLE pre_sale_catalogs RENAME TO pre_sale_catalogs_old');

        DB::statement('
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
                status           VARCHAR NOT NULL DEFAULT \'draft\'
                                 CHECK(status IN (\'draft\',\'published\',\'arrived\',\'closed\',\'cancelled\')),
                created_at       DATETIME,
                updated_at       DATETIME
            )
        ');

        DB::statement('INSERT INTO pre_sale_catalogs SELECT * FROM pre_sale_catalogs_old');
        DB::statement('DROP TABLE pre_sale_catalogs_old');

        DB::statement('CREATE INDEX IF NOT EXISTS pre_sale_catalogs_status_index ON pre_sale_catalogs(status)');
        DB::statement('CREATE INDEX IF NOT EXISTS pre_sale_catalogs_status_category_id_index ON pre_sale_catalogs(status, category_id)');

        DB::statement('PRAGMA foreign_keys = ON');
    }

    public function down(): void
    {
        DB::statement('PRAGMA foreign_keys = OFF');

        DB::statement('ALTER TABLE pre_sale_catalogs RENAME TO pre_sale_catalogs_old');

        DB::statement('
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
                status           VARCHAR NOT NULL DEFAULT \'draft\'
                                 CHECK(status IN (\'draft\',\'published\',\'closed\',\'cancelled\')),
                created_at       DATETIME,
                updated_at       DATETIME
            )
        ');

        DB::statement("INSERT INTO pre_sale_catalogs SELECT * FROM pre_sale_catalogs_old WHERE status != 'arrived'");
        DB::statement('DROP TABLE pre_sale_catalogs_old');

        DB::statement('CREATE INDEX IF NOT EXISTS pre_sale_catalogs_status_index ON pre_sale_catalogs(status)');
        DB::statement('CREATE INDEX IF NOT EXISTS pre_sale_catalogs_status_category_id_index ON pre_sale_catalogs(status, category_id)');

        DB::statement('PRAGMA foreign_keys = ON');
    }
};
