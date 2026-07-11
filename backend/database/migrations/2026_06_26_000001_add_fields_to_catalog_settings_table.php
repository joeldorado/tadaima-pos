<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Tienda Online — Fase carrito + WhatsApp (Joel 2026-06-26).
 *
 * Agrega a `catalog_settings`:
 *  - whatsapp_number: número al que llegan los pedidos del carrito (fallback al
 *    `stores.phone` cuando queda vacío). Se guarda crudo; se normaliza al armar
 *    el link wa.me en el frontend.
 *  - Flags de visibilidad que el admin alterna por tienda: buscador, filtro de
 *    categorías, descripción, carrito (vs CTA por-producto) y ocultar agotados.
 */
return new class extends Migration {
    public function up(): void
    {
        Schema::table('catalog_settings', function (Blueprint $table) {
            $table->string('whatsapp_number')->nullable()->after('catalog_url');
            $table->boolean('show_search')->default(true)->after('show_stock');
            $table->boolean('show_categories')->default(true)->after('show_search');
            $table->boolean('show_description')->default(true)->after('show_categories');
            $table->boolean('cart_enabled')->default(true)->after('show_description');
            $table->boolean('hide_out_of_stock')->default(false)->after('cart_enabled');
        });
    }

    public function down(): void
    {
        Schema::table('catalog_settings', function (Blueprint $table) {
            $table->dropColumn([
                'whatsapp_number',
                'show_search',
                'show_categories',
                'show_description',
                'cart_enabled',
                'hide_out_of_stock',
            ]);
        });
    }
};
