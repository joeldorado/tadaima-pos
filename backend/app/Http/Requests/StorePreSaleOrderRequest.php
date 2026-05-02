<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StorePreSaleOrderRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'store_id'              => ['required', 'integer', 'exists:stores,id'],
            'customer_id'           => ['required', 'integer', 'exists:customers,id'],

            'items'                 => ['required', 'array', 'min:1'],
            'items.*.catalog_id'    => ['required', 'integer', 'exists:pre_sale_catalogs,id'],
            'items.*.quantity'      => ['required', 'integer', 'min:1'],
            'items.*.price_level'   => ['required', 'integer', 'min:1', 'max:5'],

            // Anticipo inicial — obligatorio por diseño de negocio si el catálogo lo requiere
            'advance_amount'        => ['nullable', 'numeric', 'min:0'],
            'payment_method_id'     => ['nullable', 'integer', 'exists:payment_methods,id'],

            'linked_sale_id'        => ['nullable', 'integer', 'exists:sales,id'],

            'notes'                 => ['nullable', 'string', 'max:1000'],
        ];
    }

    public function messages(): array
    {
        return [
            'customer_id.required' => 'Se requiere un cliente para crear un folio de preventa.',
            'items.required'       => 'El folio debe tener al menos un producto.',
            'items.*.catalog_id.exists' => 'El catálogo seleccionado no existe.',
        ];
    }
}
