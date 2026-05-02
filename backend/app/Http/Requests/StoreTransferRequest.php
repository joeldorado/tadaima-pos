<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreTransferRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'from_warehouse_id' => ['required', 'integer', 'exists:warehouses,id'],
            'to_warehouse_id'   => [
                'required', 'integer', 'exists:warehouses,id',
                'different:from_warehouse_id',
            ],
            'notes'             => ['nullable', 'string', 'max:1000'],

            'items'              => ['required', 'array', 'min:1'],
            'items.*.product_id' => ['required', 'integer', 'exists:products,id'],
            'items.*.quantity'   => ['required', 'numeric', 'min:0.01'],
        ];
    }

    public function messages(): array
    {
        return [
            'to_warehouse_id.different' => 'La bodega de destino debe ser distinta a la de origen.',
        ];
    }
}
