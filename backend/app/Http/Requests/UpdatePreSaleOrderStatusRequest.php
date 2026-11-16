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
            // Entrega parcial (2026-11-13), solo con status=delivered: qué
            // partidas se lleva el cliente y el cobro de esa entrega, en una
            // sola llamada. Sin estos campos el folio se liquida como antes.
            'item_ids'                  => ['sometimes', 'array', 'min:1'],
            'item_ids.*'                => ['integer', 'distinct'],
            'payment'                   => ['sometimes', 'array'],
            'payment.amount'            => ['required_with:payment', 'numeric', 'min:0.01'],
            'payment.payment_method_id' => ['nullable', 'integer', 'exists:payment_methods,id'],
            // Descuento manual por partida al liquidar (2026-11-16): el mismo de
            // una venta normal. Solo para partidas de esta entrega (item_ids);
            // el servidor calcula el monto y lo topa en lo que le falta a la pieza.
            'item_discounts'          => ['sometimes', 'array', 'min:1'],
            'item_discounts.*.item_id' => ['required', 'integer', 'distinct'],
            'item_discounts.*.kind'   => ['required', 'in:fixed,percent'],
            'item_discounts.*.basis'  => ['required', 'in:unit,line'],
            'item_discounts.*.value'  => ['required', 'numeric', 'min:0.01', 'max:999999'],
            'item_discounts.*.reason' => ['required', 'in:' . implode(',', PresaleItemDiscount::REASONS)],
            'item_discounts.*.note'   => ['nullable', 'string', 'max:255'],
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
            $itemIds = array_map('intval', (array) $this->input('item_ids', []));
            foreach ($discounts as $i => $d) {
                if (! in_array((int) ($d['item_id'] ?? 0), $itemIds, true)) {
                    $v->errors()->add("item_discounts.$i.item_id", 'El descuento debe ser de una pieza que se entrega hoy.');
                }
                if (($d['kind'] ?? null) === 'percent' && (float) ($d['value'] ?? 0) > 100) {
                    $v->errors()->add("item_discounts.$i.value", 'El porcentaje no puede ser mayor a 100.');
                }
            }
        });
    }
}
