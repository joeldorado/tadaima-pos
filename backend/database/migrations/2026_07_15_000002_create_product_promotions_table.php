<?php

declare(strict_types=1);

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Promociones NxM por producto (Descuentos v2 — Fase 3, M2).
 *
 * "Compra N, paga M": 2x1 = buy_n 2 / pay_m 1 · 3x2 = 3/2 · 4x3 = 4/3 · 3x1 = 3/1.
 * Un producto puede tener VARIAS promos; en caja aplica la mejor para el
 * cliente (mayor ahorro; empate → mayor priority). No-stacking: una línea con
 * descuento manual queda FUERA de la promo (precedencia manual > promo).
 *
 * Vigencia: status manual (active|paused) + ventana starts_at/ends_at. La
 * expiración es LAZY — el scope currentlyActive() filtra por ventana en SQL,
 * no hay cron; `expired` existe para que el admin la marque/vea honesta.
 *
 * El ticket NO depende de esta tabla: al vender se snapshotea promo_name y
 * promo_free_qty en sale_items (espíritu ADR-015) — editar/borrar la promo
 * no altera tickets históricos.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('product_promotions', function (Blueprint $table) {
            $table->id();
            $table->foreignId('product_id')->constrained('products')->cascadeOnDelete();
            $table->string('name', 100);
            $table->unsignedSmallInteger('buy_n');
            $table->unsignedSmallInteger('pay_m');
            $table->dateTime('starts_at')->nullable();
            $table->dateTime('ends_at')->nullable();
            $table->enum('status', ['active', 'paused', 'expired'])->default('active');
            $table->unsignedSmallInteger('priority')->default(0);
            $table->timestamps();

            $table->index(['product_id', 'status', 'ends_at']);
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('product_promotions');
    }
};
