<?php

namespace App\Http\Requests;

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
        ];
    }
}
