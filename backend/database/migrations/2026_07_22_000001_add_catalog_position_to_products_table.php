<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Catálogo Online v5 — "top" manual del catálogo público.
 *
 * `featured` solo dice SI un producto sale primero; entre destacados mandaba
 * `id DESC` y el admin no podía decidir el orden. `catalog_position` guarda el
 * acomodo manual (0 = primero) que se edita arrastrando en Configuración →
 * Catálogo Online → Productos.
 *
 * NULL = sin acomodar → cae al orden de siempre (destacados, luego novedad).
 * Todo arranca en NULL, así que lo publicado hoy se ve idéntico.
 *
 * Sin índice a propósito: el ORDER BY va sobre la expresión
 * `(catalog_position IS NULL)`, que MySQL no puede resolver por índice, y la
 * query pública ya trae un whereExists con GROUP BY/HAVING que impide el
 * escaneo ordenado. Un índice aquí sería peso muerto (columna dispersa que
 * además nunca se usa en un WHERE).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('products', function (Blueprint $table) {
            if (!Schema::hasColumn('products', 'catalog_position')) {
                $table->integer('catalog_position')->nullable()->after('catalog_visible');
            }
        });
    }

    public function down(): void
    {
        Schema::table('products', function (Blueprint $table) {
            if (Schema::hasColumn('products', 'catalog_position')) {
                $table->dropColumn('catalog_position');
            }
        });
    }
};
