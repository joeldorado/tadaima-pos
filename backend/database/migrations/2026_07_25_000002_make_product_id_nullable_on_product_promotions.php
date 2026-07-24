<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Promos generales (2026-07-25): `product_id` pasa a nullable.
 *
 * La columna queda como rastro LEGACY (como `tiers` en el mayoreo): una promo
 * general nueva nace sin producto; las creadas por el shim anidado siguen
 * escribiéndola para que una revisión vieja de Cloud Run (ventana de rollout)
 * las siga viendo.
 *
 * El FK con cascadeOnDelete NO se altera aquí a propósito — dropForeign +
 * re-add corre distinto por driver (SQLite recrea la tabla). El hazard real
 * ("force-borrar el producto original mata una promo multi-asignada") se ataja
 * en la capa de aplicación: el force-delete de producto anula primero los
 * `product_id` legacy que apunten a él, y con el puntero en NULL el cascade no
 * tiene nada que disparar (ProductController::forceDestroy).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('product_promotions', function (Blueprint $table) {
            $table->unsignedBigInteger('product_id')->nullable()->change();
        });
    }

    public function down(): void
    {
        // No-op deliberado: revertir a NOT NULL truena si ya existen promos
        // generales sin producto. El nullable es inofensivo hacia atrás.
    }
};
