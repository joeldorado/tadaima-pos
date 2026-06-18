<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class SaleResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'                  => $this->id,
            'store_id'            => $this->store_id,
            'register_session_id' => $this->register_session_id,
            'user_id'             => $this->user_id,
            'customer_id'         => $this->customer_id,
            'terminal_id'         => $this->terminal_id,
            'draft_id'            => $this->draft_id,

            'subtotal'          => $this->subtotal,
            'discount'          => $this->discount,
            'total'             => $this->total,
            'commission_amount'   => $this->commission_amount,
            'status'              => $this->status,
            // ADR-016 — cancelación parcial: status sigue 'completed' pero la
            // venta tuvo items cancelados. Frontend debe mostrar badge "Parcial".
            'cancellation_status' => $this->cancellation_status ?? 'none',
            'last_cancelled_at'   => $this->last_cancelled_at?->toISOString(),

            // ADR-016 — monto reversado + detalle de lo cancelado (Joel
            // 2026-06-12). SIMBÓLICO para la UI: la venta se edita in-place,
            // así que `total` YA descuenta la cancelación — este monto NO debe
            // restarse otra vez de ningún agregado.
            'cancelled_amount' => $this->when(
                $this->relationLoaded('cancellations'),
                fn () => (float) $this->cancellations->sum('amount_refunded'),
            ),
            'cancelled_items' => $this->when(
                $this->relationLoaded('cancellations'),
                function () {
                    $itemSnapshots = collect($this->cancellations)->flatMap(fn ($c) => $c->items_snapshot ?? [])->all();
                    $productIds = collect($itemSnapshots)->pluck('product_id')->filter()->unique()->all();
                    $productTypes = \App\Models\Product::whereIn('id', $productIds)->pluck('product_type', 'id')->all();
                    return collect($itemSnapshots)->map(fn ($i) => [
                        'product_id'   => $i['product_id'] ?? null,
                        'name'         => $i['name'] ?? '',
                        'sku'          => $i['sku'] ?? null,
                        'quantity'     => (float) ($i['qty_cancelled'] ?? 0),
                        'price'        => (float) ($i['price'] ?? 0),
                        'line_total'   => (float) ($i['line_total'] ?? 0),
                        'product_type' => isset($i['product_id']) ? ($productTypes[$i['product_id']] ?? 'product') : 'product',
                    ])->values()->all();
                }
            ),

            'customer' => $this->when(
                $this->relationLoaded('customer') && $this->customer,
                fn () => [
                    'id'   => $this->customer->id,
                    'name' => $this->customer->name,
                    'tier' => $this->customer->loyalty_tier,
                ],
            ),

            // Vendedor (cajero/gerente/admin que registró la venta). Solo se
            // expone cuando el caller hizo eager-load explícito (with('user')).
            'user' => $this->when(
                $this->relationLoaded('user') && $this->user,
                fn () => [
                    'id'   => $this->user->id,
                    'name' => $this->user->name,
                ],
            ),

            'items' => $this->when(
                $this->relationLoaded('items'),
                fn () => SaleItemResource::collection($this->items),
            ),

            'payments' => $this->when(
                $this->relationLoaded('payments'),
                fn () => PaymentResource::collection($this->payments),
            ),

            // Preventas creadas en la misma transacción del ticket (cobro mixto:
            // regular + anticipo de nueva preventa). El frontend usa esto para
            // mostrar UN solo ticket padre con desglose completo, en vez de
            // separar la venta y la preventa como si fueran transacciones distintas.
            'pre_sale_orders' => $this->when(
                $this->relationLoaded('preSaleOrders'),
                fn () => $this->preSaleOrders->map(fn ($o) => [
                    'id'           => $o->id,
                    'code'         => $o->code,
                    'status'       => $o->status,
                    'total'        => $o->total,
                    'paid_amount'  => $o->paid_amount,
                    'balance'      => $o->balance,
                    'items'        => ($o->relationLoaded('items') ? $o->items : collect())->map(fn ($it) => [
                        'id'           => $it->id,
                        'product_id'   => $it->product_id,
                        'quantity'     => $it->quantity,
                        'unit_price'   => $it->unit_price,
                        'price_level'  => $it->price_level,
                        'status'       => $it->status,
                        'catalog'      => $it->relationLoaded('catalog') && $it->catalog ? [
                            'id'           => $it->catalog->id,
                            'product_name' => $it->catalog->product_name,
                        ] : null,
                    ])->values(),
                ])->values(),
            ),

            'sold_at'    => $this->sold_at?->toISOString(),
            'created_at' => $this->created_at?->toISOString(),
        ];
    }
}
