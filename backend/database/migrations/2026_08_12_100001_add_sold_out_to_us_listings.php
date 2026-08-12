<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// TadaimaUS — agotado MANUAL por listing (Joel/Pier 2026-08-12).
// Ortogonal a `visible` (oculta por completo) y al in_stock calculado de
// SellableStock (que solo aplica a listings con product_id y OCULTA del
// catálogo): sold_out=true se MUESTRA en la tienda con badge "Sold Out",
// bloquea el add-to-cart y POST /us/orders lo rechaza con 422. Es la única
// forma de marcar agotado un listing custom (product_id null).
//
// Idempotente (hasColumn) — corre con `migrate --force` en cada arranque.

return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasTable('us_listings') || Schema::hasColumn('us_listings', 'sold_out')) {
            return;
        }

        Schema::table('us_listings', function (Blueprint $table) {
            $table->boolean('sold_out')->default(false)->after('visible');
        });
    }

    public function down(): void
    {
        if (! Schema::hasColumn('us_listings', 'sold_out')) {
            return;
        }

        Schema::table('us_listings', function (Blueprint $table) {
            $table->dropColumn('sold_out');
        });
    }
};
