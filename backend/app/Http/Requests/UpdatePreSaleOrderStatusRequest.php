<?php

namespace App\Http\Requests;

use App\Support\PresaleItemDiscount;
use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;

class UpdatePreSaleOrderStatusRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'status'          => ['required', 'in:ready,delivered,expired,cancelled'],
            'pickup_deadline' => ['nullable', 'date'],
            'notes'           => ['nullable', 'string', 'max:1000'],
            ...self::deliveryRules(),
        ];
    }

    /**
     * Reglas de la entrega elegida: partidas, cobro y descuentos. `$prefix` es
     * el bloque donde viven (vacío aquí, `liquidation.` en el cobro mixto).
     *
     * @return array<string, array<int, mixed>>
     */
    public static function deliveryRules(string $prefix = ''): array
    {
        return [
            // Entrega parcial (2026-11-13), solo con status=delivered: qué
            // partidas se lleva el cliente y el cobro de esa entrega, en una
            // sola llamada. Sin estos campos el folio se liquida como antes.
            "{$prefix}item_ids"                  => ['sometimes', 'array', 'min:1'],
            "{$prefix}item_ids.*"                => ['integer', 'distinct'],
            "{$prefix}payment"                   => ['sometimes', 'array'],
            "{$prefix}payment.amount"            => ["required_with:{$prefix}payment", 'numeric', 'min:0.01'],
            "{$prefix}payment.payment_method_id" => ['nullable', 'integer', 'exists:payment_methods,id'],
            // Cobro en lista (2026-11-23, autorizado por Pier): Tarjeta con su
            // terminal o Mixto. Si viene, manda sobre `payment`.
            ...StorePreSaleOrderRequest::paymentListRules("{$prefix}payments"),
            // Descuento manual por partida al liquidar (2026-11-16): el mismo de
            // una venta normal. Solo para partidas de esta entrega (item_ids);
            // el servidor calcula el monto y lo topa en lo que le falta a la pieza.
            "{$prefix}item_discounts"          => ['sometimes', 'array', 'min:1'],
            "{$prefix}item_discounts.*.item_id" => ['required', 'integer', 'distinct'],
            "{$prefix}item_discounts.*.kind"   => ['required', 'in:fixed,percent'],
            "{$prefix}item_discounts.*.basis"  => ['required', 'in:unit,line'],
            "{$prefix}item_discounts.*.value"  => ['required', 'numeric', 'min:0.01', 'max:999999'],
            "{$prefix}item_discounts.*.reason" => ['required', 'in:' . implode(',', PresaleItemDiscount::REASONS)],
            "{$prefix}item_discounts.*.note"   => ['nullable', 'string', 'max:255'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $v) {
            $discounts = $this->input('item_discounts');
            if (! is_array($discounts) || $discounts === []) {
                return;
            }
            if ($this->input('status') !== 'delivered') {
                $v->errors()->add('item_discounts', 'El descuento solo se pone al entregar.');
                return;
            }
            self::validateItemDiscounts($v, $discounts, (array) $this->input('item_ids', []));
        });
    }

    /**
     * Cada descuento es de una pieza de esta entrega y el porcentaje no pasa de 100.
     *
     * @param  array<int|string, mixed>  $discounts
     * @param  array<int|string, mixed>  $itemIds
     */
    public static function validateItemDiscounts(Validator $v, array $discounts, array $itemIds, string $prefix = ''): void
    {
        $ids = array_map('intval', $itemIds);
        foreach ($discounts as $i => $d) {
            if (! in_array((int) ($d['item_id'] ?? 0), $ids, true)) {
                $v->errors()->add("{$prefix}item_discounts.$i.item_id", 'El descuento debe ser de una pieza que se entrega hoy.');
            }
            if (($d['kind'] ?? null) === 'percent' && (float) ($d['value'] ?? 0) > 100) {
                $v->errors()->add("{$prefix}item_discounts.$i.value", 'El porcentaje no puede ser mayor a 100.');
            }
        }
    }
}
