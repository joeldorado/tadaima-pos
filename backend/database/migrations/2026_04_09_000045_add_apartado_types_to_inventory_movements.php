<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    private const ALL_TYPES = [
        'entrada', 'venta', 'ajuste', 'transferencia', 'devolucion',
        'preventa', 'preventa_cancelada', 'apartado', 'apartado_cancelado',
    ];

    private const ORIGINAL_TYPES = [
        'entrada', 'venta', 'ajuste', 'transferencia', 'devolucion',
        'preventa', 'preventa_cancelada',
    ];

    public function up(): void
    {
        if (DB::getDriverName() === 'sqlite') {
            $this->recreateForSqlite(self::ALL_TYPES);
        } else {
            $enumList = implode(',', array_map(fn ($t) => "'$t'", self::ALL_TYPES));
            DB::statement("ALTER TABLE inventory_movements MODIFY COLUMN type ENUM({$enumList}) NOT NULL");
        }
    }

    public function down(): void
    {
        if (DB::getDriverName() === 'sqlite') {
            $this->recreateForSqlite(self::ORIGINAL_TYPES);
        } else {
            $enumList = implode(',', array_map(fn ($t) => "'$t'", self::ORIGINAL_TYPES));
            DB::statement("ALTER TABLE inventory_movements MODIFY COLUMN type ENUM({$enumList}) NOT NULL");
        }
    }

    private function recreateForSqlite(array $types): void
    {
        // SQLite keeps index names global, so drop them before renaming to avoid
        // conflicts when the new table recreates them with the same names.
        DB::statement('DROP INDEX IF EXISTS inventory_movements_product_id_warehouse_id_index');
        DB::statement('DROP INDEX IF EXISTS inventory_movements_created_at_index');

        Schema::rename('inventory_movements', 'inventory_movements_old');

        Schema::create('inventory_movements', function (Blueprint $table) use ($types) {
            $table->id();
            $table->foreignId('product_id')->constrained()->cascadeOnDelete();
            $table->foreignId('warehouse_id')->constrained()->cascadeOnDelete();
            $table->enum('type', $types);
            $table->decimal('quantity', 12, 2);
            $table->string('reference')->nullable();
            $table->text('notes')->nullable();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['product_id', 'warehouse_id']);
            $table->index('created_at');
        });

        DB::statement('INSERT INTO inventory_movements SELECT * FROM inventory_movements_old');
        Schema::drop('inventory_movements_old');
    }
};
