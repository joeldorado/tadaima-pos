<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * SQLite does not support altering CHECK constraints.
 * We recreate inventory_movements with the two new movement types added:
 *   - apartado          (layaway reservation — decreases stock)
 *   - apartado_cancelado (layaway cancellation — increases stock)
 */
return new class extends Migration
{
    public function up(): void
    {
        // 1. Rename existing table
        Schema::rename('inventory_movements', 'inventory_movements_old');

        // 2. Create new table with extended type list
        DB::statement('
            CREATE TABLE inventory_movements (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
                type        TEXT NOT NULL CHECK(type IN (
                                \'entrada\',
                                \'venta\',
                                \'ajuste\',
                                \'transferencia\',
                                \'devolucion\',
                                \'preventa\',
                                \'preventa_cancelada\',
                                \'apartado\',
                                \'apartado_cancelado\'
                            )),
                quantity    NUMERIC(12,2) NOT NULL,
                reference   TEXT,
                notes       TEXT,
                user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ');

        // 3. Recreate indexes
        DB::statement('CREATE INDEX inventory_movements_product_warehouse ON inventory_movements (product_id, warehouse_id)');
        DB::statement('CREATE INDEX inventory_movements_created_at ON inventory_movements (created_at)');

        // 4. Copy all existing data
        DB::statement('INSERT INTO inventory_movements SELECT * FROM inventory_movements_old');

        // 5. Drop old table
        Schema::drop('inventory_movements_old');
    }

    public function down(): void
    {
        // Reverse: recreate without apartado types (existing rows with those types will fail)
        Schema::rename('inventory_movements', 'inventory_movements_new');

        DB::statement('
            CREATE TABLE inventory_movements (
                id          INTEGER PRIMARY KEY AUTOINCREMENT,
                product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
                warehouse_id INTEGER NOT NULL REFERENCES warehouses(id) ON DELETE CASCADE,
                type        TEXT NOT NULL CHECK(type IN (
                                \'entrada\',
                                \'venta\',
                                \'ajuste\',
                                \'transferencia\',
                                \'devolucion\',
                                \'preventa\',
                                \'preventa_cancelada\'
                            )),
                quantity    NUMERIC(12,2) NOT NULL,
                reference   TEXT,
                notes       TEXT,
                user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
            )
        ');

        DB::statement('CREATE INDEX inventory_movements_product_warehouse ON inventory_movements (product_id, warehouse_id)');
        DB::statement('CREATE INDEX inventory_movements_created_at ON inventory_movements (created_at)');
        DB::statement('INSERT INTO inventory_movements SELECT * FROM inventory_movements_new WHERE type NOT IN (\'apartado\', \'apartado_cancelado\')');
        Schema::drop('inventory_movements_new');
    }
};
