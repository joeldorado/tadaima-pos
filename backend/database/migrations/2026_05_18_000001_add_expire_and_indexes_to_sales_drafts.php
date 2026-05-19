<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Facades\DB;

/**
 * Soporte para reservas cross-caja:
 *
 *  - sales_drafts.expires_at  → cuándo vence el draft por inactividad
 *  - sales_drafts.warned_at   → cuándo el job marcó "por vencer" (frontend muestra modal)
 *  - Índice compuesto (draft_id, product_id) en sales_draft_items para que la query
 *    de "stock reservado por tienda" no haga full scan.
 *  - Índice (store_id, active) en warehouses para acelerar el filtro de bodegas.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('sales_drafts', function (Blueprint $table): void {
            $table->timestamp('expires_at')->nullable()->after('status');
            $table->timestamp('warned_at')->nullable()->after('expires_at');
            $table->index(['status', 'expires_at'], 'idx_drafts_status_expires');
        });

        // Inicializa expires_at en drafts ya abiertos (5 min desde updated_at).
        // Drafts viejos sin actividad reciente serán cancelados por el job en su
        // primer ciclo — comportamiento deseado para limpiar residuos del bug previo.
        $driver = Schema::getConnection()->getDriverName();
        $expr = match ($driver) {
            'mysql', 'mariadb' => "DATE_ADD(updated_at, INTERVAL 5 MINUTE)",
            'sqlite' => "datetime(updated_at, '+5 minutes')",
            'pgsql' => "updated_at + INTERVAL '5 minutes'",
            default => null,
        };

        if ($expr !== null) {
            DB::table('sales_drafts')
                ->where('status', 'open')
                ->whereNull('expires_at')
                ->update(['expires_at' => DB::raw($expr)]);
        }

        Schema::table('sales_draft_items', function (Blueprint $table): void {
            // Cubre la query agregada: "SUM(quantity) por product_id en drafts de
            // store X con status=open" — el JOIN entra por draft_id y agrupa por
            // product_id. Sin este compuesto MySQL hace lookup por PK clustered.
            $table->index(['draft_id', 'product_id'], 'idx_sdi_draft_product');
        });

        Schema::table('warehouses', function (Blueprint $table): void {
            $table->index(['store_id', 'active'], 'idx_warehouses_store_active');
        });
    }

    public function down(): void
    {
        Schema::table('warehouses', function (Blueprint $table): void {
            $table->dropIndex('idx_warehouses_store_active');
        });

        Schema::table('sales_draft_items', function (Blueprint $table): void {
            $table->dropIndex('idx_sdi_draft_product');
        });

        Schema::table('sales_drafts', function (Blueprint $table): void {
            $table->dropIndex('idx_drafts_status_expires');
            $table->dropColumn(['expires_at', 'warned_at']);
        });
    }
};
