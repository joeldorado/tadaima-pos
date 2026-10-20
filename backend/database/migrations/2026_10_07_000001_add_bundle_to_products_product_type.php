<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Paquetes (2026-10-07): agrega 'bundle' a products.product_type.
 *
 * Un paquete es una fila de `products` (como los tomos, product_type='manga')
 * con su composición en `product_bundle_items` y su bitácora en
 * `bundle_assemblies`. Postgres materializa el enum como varchar + CHECK
 * `products_product_type_check` (verificado en prod: ('product','manga')),
 * así que se re-crea el CHECK (mismo patrón que 2026_04_09_000045 para
 * inventory_movements). SQLite (tests, migrate:fresh) ya nace con 'bundle'
 * desde la migración base; un archivo SQLite local viejo entra al ->change().
 * Idempotente: se puede volver a correr.
 */
return new class extends Migration
{
    private const TYPES = ['product', 'manga', 'bundle'];

    private const ORIGINAL_TYPES = ['product', 'manga'];

    public function up(): void
    {
        $this->applyTypes(self::TYPES);
    }

    public function down(): void
    {
        // Nunca borra datos: si ya hay paquetes, el CHECK viejo los rechazaría.
        if (DB::table('products')->where('product_type', 'bundle')->exists()) {
            return;
        }
        $this->applyTypes(self::ORIGINAL_TYPES);
    }

    private function applyTypes(array $types): void
    {
        $driver = DB::getDriverName();

        if ($driver === 'pgsql') {
            // Se suelta cualquier CHECK de products que mencione product_type
            // (por si el nombre difiere en algún entorno) y se re-crea con el
            // nombre canónico de Laravel.
            $checks = DB::select(
                "SELECT c.conname FROM pg_constraint c
                 JOIN pg_class t ON t.oid = c.conrelid
                 WHERE t.relname = 'products' AND c.contype = 'c'
                   AND pg_get_constraintdef(c.oid) ILIKE '%product_type%'"
            );
            foreach ($checks as $row) {
                DB::statement(sprintf('ALTER TABLE products DROP CONSTRAINT IF EXISTS "%s"', $row->conname));
            }
            $list = implode(', ', array_map(fn (string $t) => "'{$t}'::text", $types));
            DB::statement("ALTER TABLE products ADD CONSTRAINT products_product_type_check CHECK (product_type::text = ANY (ARRAY[{$list}]))");

            return;
        }

        if ($driver === 'mysql') {
            $enum = implode(',', array_map(fn (string $t) => "'{$t}'", $types));
            DB::statement("ALTER TABLE products MODIFY COLUMN product_type ENUM({$enum}) NOT NULL DEFAULT 'product'");

            return;
        }

        if ($driver === 'sqlite') {
            $sql = (string) DB::table('sqlite_master')
                ->where('type', 'table')
                ->where('name', 'products')
                ->value('sql');
            $hasBundle = str_contains($sql, "'bundle'");
            $wantsBundle = in_array('bundle', $types, true);
            if ($hasBundle === $wantsBundle) {
                return; // ya está como se pide (tests nacen con 'bundle')
            }
            // Laravel recrea la tabla (__temp__products → copia → drop → rename).
            // Las FKs entrantes referencian el NOMBRE 'products' y siguen válidas.
            Schema::table('products', function (Blueprint $table) use ($types): void {
                $table->enum('product_type', $types)->default('product')->change();
            });
        }
    }
};
