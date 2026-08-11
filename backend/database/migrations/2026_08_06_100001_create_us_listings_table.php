<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// TadaimaUS — productos del POS publicados en la tienda US (tadaimaus.com).
//
// Un listing "publica" un producto EXISTENTE del POS en la tienda US con su
// propio nombre/descripción (en inglés), precio en dólares y categoría US
// (figures | manga | tcg | other). image_url null ⇒ los payloads caen a la
// primera foto del producto del POS.
//
// product_id unique: un producto solo puede estar publicado UNA vez.
// cascadeOnDelete: si el producto se borra físicamente, el listing muere con
// él (los pedidos ya hechos conservan su snapshot en us_order_items).
//
// Idempotente (Schema::hasTable): corre con `migrate --force` en cada arranque
// del contenedor de Cloud Run. Compatible Postgres (prod Supabase) y SQLite
// (tests en memoria).

return new class extends Migration
{
    public function up(): void
    {
        if (Schema::hasTable('us_listings')) {
            return;
        }

        Schema::create('us_listings', function (Blueprint $table) {
            $table->id();

            $table->foreignId('product_id')
                  ->unique()
                  ->constrained()
                  ->cascadeOnDelete();

            // Nombre/descripción propios del listing (inglés — sitio US).
            $table->string('name');
            $table->text('description')->nullable();

            // Precio en dólares capturado a mano por el admin (comercial, no FX).
            $table->decimal('price_usd', 10, 2);

            // Categoría US: figures | manga | tcg | other (constantes compartidas).
            $table->string('category')->default('other');

            // null ⇒ el payload cae a la primera imagen del producto del POS.
            $table->string('image_url', 500)->nullable();

            // Pausar un producto de la tienda US sin despublicarlo.
            $table->boolean('visible')->default(true);

            $table->timestamps();

            $table->index('visible');
            $table->index('category');
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('us_listings');
    }
};
