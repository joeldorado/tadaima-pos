<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Unifica mangas dentro de la tabla products usando Class Table Inheritance:
 *
 *   products (base)                ← common fields + product_type discriminator
 *   product_manga_details (ext)    ← campos exclusivos de manga (volume, editorial, genre)
 *   inventory (compartida)         ← stock por bodega para TODOS los tipos
 *
 * Motivación: el checkout, devoluciones y reportes solo conocen `product_id`.
 * Mantener mangas en tablas paralelas requería branching en muchos paths y
 * el checkout actual nunca había podido cobrar librerías. Unificar elimina
 * esa deuda técnica permanente.
 *
 * Esta migración:
 *   1) Agrega `product_type` a products + crea tabla de detalles de manga.
 *   2) Migra TODOS los mangas existentes a filas de products (atómica).
 *   3) Copia manga_inventory → inventory con el nuevo product_id.
 *   4) Re-mapea sale_items / sales_draft_items.manga_id → product_id.
 *
 * Mantiene `mangas` y `manga_inventory` como backup. Se eliminarán después
 * de validar 1-2 semanas en producción.
 *
 * Sin rollback automático: los datos quedan en las tablas originales si
 * algo falla, pero el down() limpia las columnas nuevas y permite re-correr.
 */
return new class extends Migration {
    public function up(): void
    {
        // ── 1. Schema: tipo discriminador en products ─────────────────────────
        if (! Schema::hasColumn('products', 'product_type')) {
            Schema::table('products', function (Blueprint $table): void {
                $table->enum('product_type', ['product', 'manga'])
                    ->default('product')
                    ->after('active');
                $table->index('product_type', 'idx_products_type');
            });
        }

        // ── 2. Schema: tabla extensión para detalles de manga ─────────────────
        if (! Schema::hasTable('product_manga_details')) {
            Schema::create('product_manga_details', function (Blueprint $table): void {
                $table->unsignedBigInteger('product_id')->primary();
                $table->unsignedSmallInteger('volume_number')->nullable();
                $table->string('editorial')->nullable();
                $table->string('genre')->nullable();
                $table->timestamps();

                $table->foreign('product_id')
                    ->references('id')->on('products')
                    ->cascadeOnDelete();
            });
        }

        // ── 3. Si no hay tabla `mangas` no hay nada que migrar (entornos
        //      nuevos donde el schema ya empieza unificado) ───────────────────
        if (! Schema::hasTable('mangas')) {
            return;
        }

        // ── 4. Migración de datos en una sola transacción ────────────────────
        DB::transaction(function (): void {
            $mangas = DB::table('mangas')->get();
            $migrated = 0;
            $skipped  = 0;
            // map old_manga_id => new_product_id, para remappear sale_items
            $idMap = [];

            foreach ($mangas as $m) {
                // Skip si ya fue migrado (re-run idempotente)
                $existingDetail = DB::table('product_manga_details as d')
                    ->join('products as p', 'p.id', '=', 'd.product_id')
                    ->where('p.product_type', 'manga')
                    ->where(function ($q) use ($m): void {
                        $q->where('d.editorial', $m->editorial)
                          ->where('d.volume_number', $m->volume_number)
                          ->where('p.name', $m->name);
                    })
                    ->select('d.product_id')
                    ->first();

                if ($existingDetail) {
                    $idMap[$m->id] = (int) $existingDetail->product_id;
                    $skipped++;
                    continue;
                }

                // Resolver SKU: products.sku es UNIQUE. Si manga.code colisiona,
                // prefijar `MANGA-{id}-{code}` para garantizar unicidad sin
                // perder el código original (queda en MANGA-prefix).
                $candidateSku = $m->code ?: "MANGA-{$m->id}";
                $skuExists = DB::table('products')->where('sku', $candidateSku)->exists();
                $sku = $skuExists ? "MANGA-{$m->id}-{$candidateSku}" : $candidateSku;

                // INSERT producto base
                $newId = DB::table('products')->insertGetId([
                    'category_id'  => null,
                    'name'         => $m->name,
                    'sku'          => $sku,
                    'barcode'      => $m->code, // barcode lleva el código original
                    'description'  => null,
                    'cost'         => $m->cost,
                    'active'       => $m->active,
                    'product_type' => 'manga',
                    'created_at'   => $m->created_at,
                    'updated_at'   => $m->updated_at,
                ]);

                // INSERT detalles de manga (extensión)
                DB::table('product_manga_details')->insert([
                    'product_id'    => $newId,
                    'volume_number' => $m->volume_number,
                    'editorial'     => $m->editorial,
                    'genre'         => $m->genre,
                    'created_at'    => $m->created_at,
                    'updated_at'    => $m->updated_at,
                ]);

                // INSERT precios (solo si alguno está definido)
                $hasPrice = ($m->price_1 ?? null) !== null
                    || ($m->price_2 ?? null) !== null
                    || ($m->price_3 ?? null) !== null
                    || ($m->price_4 ?? null) !== null
                    || ($m->price_5 ?? null) !== null;

                if ($hasPrice) {
                    DB::table('product_prices')->insert([
                        'product_id' => $newId,
                        'price_1'    => $m->price_1,
                        'price_2'    => $m->price_2,
                        'price_3'    => $m->price_3,
                        'price_4'    => $m->price_4,
                        'price_5'    => $m->price_5,
                        'created_at' => $m->created_at,
                        'updated_at' => $m->updated_at,
                    ]);
                }

                // INSERT imagen (si existe image_path)
                if (! empty($m->image_path)) {
                    DB::table('product_images')->insert([
                        'product_id' => $newId,
                        'image_path' => $m->image_path,
                        'sort_order' => 0,
                        'created_at' => $m->created_at,
                        'updated_at' => $m->updated_at,
                    ]);
                }

                // Copia inventario de manga_inventory → inventory (mismo product_id nuevo).
                // ON DUPLICATE: si ya existe (re-run), sumar cantidades sería peligroso;
                // mejor ignorar — el run inicial creó la fila.
                $invRows = DB::table('manga_inventory')->where('manga_id', $m->id)->get();
                foreach ($invRows as $inv) {
                    $exists = DB::table('inventory')
                        ->where('product_id', $newId)
                        ->where('warehouse_id', $inv->warehouse_id)
                        ->exists();
                    if (! $exists) {
                        DB::table('inventory')->insert([
                            'product_id'   => $newId,
                            'warehouse_id' => $inv->warehouse_id,
                            'quantity'     => $inv->quantity,
                            'created_at'   => $inv->created_at,
                            'updated_at'   => $inv->updated_at,
                        ]);
                    }
                }

                // Re-mapear sale_items históricos: manga_id=OLD_ID → product_id=NEW_ID
                DB::table('sale_items')
                    ->where('manga_id', $m->id)
                    ->whereNull('product_id')
                    ->update([
                        'product_id' => $newId,
                        'manga_id'   => null,
                    ]);

                // Re-mapear sales_draft_items (deberían estar todos cancelled
                // por la migración previa de cross-caja, pero por completitud).
                DB::table('sales_draft_items')
                    ->where('manga_id', $m->id)
                    ->whereNull('product_id')
                    ->update([
                        'product_id' => $newId,
                        'manga_id'   => null,
                    ]);

                $idMap[$m->id] = $newId;
                $migrated++;
            }

            if ($migrated > 0 || $skipped > 0) {
                echo "  Mangas → products: {$migrated} migrados, {$skipped} ya existían (re-run idempotente)" . PHP_EOL;
            }
        });
    }

    public function down(): void
    {
        // No reversible — los rows en products marcados como product_type='manga'
        // pueden tener sale_items, payments, etc. asociados que no podemos
        // re-mapear de vuelta. La data original sigue intacta en `mangas` y
        // `manga_inventory` (no se borran en up()), así que un rollback a mano
        // es posible borrando los products con type='manga'.
        if (Schema::hasTable('product_manga_details')) {
            Schema::dropIfExists('product_manga_details');
        }
        if (Schema::hasColumn('products', 'product_type')) {
            Schema::table('products', function (Blueprint $table): void {
                $table->dropIndex('idx_products_type');
                $table->dropColumn('product_type');
            });
        }
    }
};
