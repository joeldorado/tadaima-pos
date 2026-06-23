<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * Mover stock entre dos almacenes de LA MISMA tienda (Exhibición ↔ Bodega).
 * El guard de tienda y la validación "misma tienda" viven en el controller.
 */
class MoveInventoryRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'product_id'        => ['required', 'integer', 'exists:products,id'],
            'from_warehouse_id' => ['required', 'integer', 'exists:warehouses,id'],
            'to_warehouse_id'   => ['required', 'integer', 'different:from_warehouse_id', 'exists:warehouses,id'],
            'quantity'          => ['required', 'numeric', 'gt:0'],
            'notes'             => ['nullable', 'string', 'max:500'],
        ];
    }

    public function messages(): array
    {
        return [
            'to_warehouse_id.different' => 'El almacén destino debe ser distinto del origen.',
            'quantity.gt'              => 'La cantidad a mover debe ser mayor a 0.',
        ];
    }
}
