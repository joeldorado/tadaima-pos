<?php

namespace App\Http\Requests;

use App\Models\InventoryMovement;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreInventoryMovementRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'product_id'   => ['required', 'integer', 'exists:products,id'],
            'warehouse_id' => ['required', 'integer', 'exists:warehouses,id'],
            'type'         => ['required', Rule::in(InventoryMovement::ALL_TYPES)],

            // Para ajuste y transferencia se permite negativo (el signo decide dirección).
            // Para el resto la cantidad siempre debe ser positiva.
            'quantity'     => ['required', 'numeric', 'not_in:0'],

            'reference'    => ['nullable', 'string', 'max:100'],
            'notes'        => ['nullable', 'string', 'max:500'],
        ];
    }

    public function messages(): array
    {
        return [
            'type.in'       => 'Tipo inválido. Válidos: ' . implode(', ', InventoryMovement::ALL_TYPES),
            'quantity.not_in' => 'La cantidad no puede ser cero.',
        ];
    }
}
