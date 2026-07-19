<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;

/**
 * Convierte las promos `qty_discount` viejas (por grupo) al modelo de mayoreo
 * (por pieza desde N). Gemela de _000001, separada a propósito: si esto truena
 * con datos raros, el esquema ya aterrizó y solo se reintenta el backfill.
 *
 * El `amount` viejo se toma TAL CUAL como el descuento por pieza (decisión de
 * Joel 2026-07-23): así es como él lee sus promos — "2 → −$100" siempre quiso
 * decir −$100 a CADA una, $200 en total. En consecuencia las promas vivas
 * descuentan MÁS que con el modelo por grupos, y eso es lo buscado.
 *
 * (La alternativa era dividir, `per_unit = amount / qty`, para conservar el
 * total. Se descartó: además de no ser lo que Joel quería, ni siquiera
 * conservaba el total — 100 ÷ 3 = 33.33, y 3 pzas daban $99.99.)
 *
 * Idempotente por `whereNull('min_qty')`, no solo por la tabla `migrations`.
 */
return new class extends Migration
{
    public function up(): void
    {
        $rows = DB::table('product_promotions')
            ->where('type', 'qty_discount')
            ->whereNull('min_qty')
            ->get(['id', 'tiers']);

        foreach ($rows as $row) {
            $clean = collect(json_decode((string) $row->tiers, true) ?: [])
                ->map(fn ($t) => [
                    'qty'    => (int) ($t['qty'] ?? 0),
                    'amount' => (float) ($t['amount'] ?? 0),
                ])
                ->filter(fn ($t) => $t['qty'] >= 2 && $t['amount'] > 0)
                ->values();

            // Multi-escalón: NO hay conversión honesta a un solo escalón. Tomar
            // el menor parte a la mitad el descuento del escalón alto; tomar el
            // mayor lo dispara. Se pausa y se loguea — `tiers` queda como rastro
            // para reconfigurarla a mano, y la UI la marca "Sin configurar".
            if ($clean->count() !== 1) {
                DB::table('product_promotions')
                    ->where('id', $row->id)
                    ->update(['status' => 'paused']);

                Log::warning('[mayoreo] promo multi-escalón pausada, requiere reconfiguración', [
                    'promotion_id' => $row->id,
                    'tiers'        => $row->tiers,
                ]);
                continue;
            }

            $tier = $clean->first();
            DB::table('product_promotions')
                ->where('id', $row->id)
                ->update([
                    'min_qty'           => $tier['qty'],
                    'discount_per_unit' => $tier['amount'],
                ]);
        }
    }

    /**
     * No-op: revertir es dropear las columnas (migración _000001), y `tiers`
     * sigue intacto con los datos originales.
     */
    public function down(): void
    {
    }
};
