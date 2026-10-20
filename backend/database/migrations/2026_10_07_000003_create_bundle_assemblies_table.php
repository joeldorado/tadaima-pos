<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Paquetes (2026-10-07): bitácora de armados y desarmados por tienda.
 *
 * Cada renglón es un armado ('armado') o desarmado ('desarmado') de N paquetes
 * en una tienda, con el desglose de componentes que se movieron
 * (components_snapshot: product_id, name, sku, qty_per_bundle, total_qty,
 * from_store_qty / from_bodega_qty o to_warehouse, unit_cost). `type` es string
 * (sin CHECK) a propósito: evita otro constraint que mantener en Postgres.
 * Los movimientos de stock reales quedan en inventory_movements con
 * reference "PAQ-{bundle_product_id}".
 */
return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('bundle_assemblies')) {
            return;
        }

        Schema::create('bundle_assemblies', function (Blueprint $table): void {
            $table->id();
            $table->foreignId('bundle_product_id')->constrained('products')->cascadeOnDelete();
            $table->foreignId('store_id')->constrained('stores')->cascadeOnDelete();
            // Armado: Exhibición donde cayó el paquete. Desarmado: almacén al que
            // regresaron los componentes.
            $table->foreignId('warehouse_id')->constrained('warehouses')->cascadeOnDelete();
            $table->foreignId('user_id')->nullable()->constrained('users')->nullOnDelete();
            $table->string('type', 16); // 'armado' | 'desarmado'
            $table->unsignedInteger('quantity');
            $table->json('components_snapshot');
            $table->text('notes')->nullable();
            $table->timestamp('created_at')->useCurrent();

            $table->index(['bundle_product_id', 'created_at'], 'ba_bundle_created_idx');
            $table->index(['store_id', 'created_at'], 'ba_store_created_idx');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('bundle_assemblies');
    }
};
