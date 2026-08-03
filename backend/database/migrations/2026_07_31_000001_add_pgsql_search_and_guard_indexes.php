<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;

/**
 * Migración a Supabase/Postgres (2026-07-30) — SOLO pgsql, no-op en mysql/sqlite:
 *
 * 1. Índices trigram (pg_trgm GIN) en products.name/sku/barcode — reemplazan al
 *    FULLTEXT de MySQL (2026_05_15_000002, que es solo-mysql) para que el
 *    buscador con ILIKE '%term%' no haga seq scan.
 * 2. Índice parcial UNIQUE "una caja abierta por persona" (ADR-017): en MySQL
 *    la garantía venía de gap locks de InnoDB con lockForUpdate; Postgres no
 *    tiene gap locks → dos aperturas simultáneas podrían crear dos sesiones.
 *    El índice parcial lo vuelve imposible a nivel de datos.
 *
 * En Supabase las extensiones viven en el schema `extensions` (el rol postgres
 * puede crearlas); la opclass va calificada para no depender del search_path.
 * En un Postgres local (brew) basta crear antes: CREATE SCHEMA IF NOT EXISTS extensions.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            return;
        }

        DB::statement('CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA extensions');
        DB::statement('CREATE INDEX IF NOT EXISTS products_name_trgm    ON products USING gin (name    extensions.gin_trgm_ops)');
        DB::statement('CREATE INDEX IF NOT EXISTS products_sku_trgm     ON products USING gin (sku     extensions.gin_trgm_ops)');
        DB::statement('CREATE INDEX IF NOT EXISTS products_barcode_trgm ON products USING gin (barcode extensions.gin_trgm_ops)');

        DB::statement("CREATE UNIQUE INDEX IF NOT EXISTS cash_sessions_one_open_per_user ON cash_register_sessions (user_id) WHERE status = 'open'");
    }

    public function down(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            return;
        }

        DB::statement('DROP INDEX IF EXISTS products_name_trgm');
        DB::statement('DROP INDEX IF EXISTS products_sku_trgm');
        DB::statement('DROP INDEX IF EXISTS products_barcode_trgm');
        DB::statement('DROP INDEX IF EXISTS cash_sessions_one_open_per_user');
    }
};
