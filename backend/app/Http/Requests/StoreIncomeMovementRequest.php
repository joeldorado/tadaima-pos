<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Models\IncomeMovement;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreIncomeMovementRequest extends FormRequest
{
    /**
     * Authorization is done in the controller via gates.
     */
    public function authorize(): bool
    {
        return true;
    }

    /**
     * Validation rules for income movement creation.
     *
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'type'        => ['required', Rule::in(IncomeMovement::TYPES)],
            'amount'      => ['required', 'numeric', 'min:0.01'],
            'description' => ['nullable', 'string', 'max:255'],
            'store_id'    => ['nullable', 'integer', 'exists:stores,id'],
        ];
    }

    /**
     * Custom validation messages.
     *
     * @return array<string, string>
     */
    public function messages(): array
    {
        return [
            'type.required' => 'El tipo de ingreso es obligatorio.',
            'type.in'       => 'Tipo de ingreso inválido.',
            'amount.required' => 'El monto es obligatorio.',
            'amount.min'    => 'El monto debe ser mayor a 0.',
        ];
    }
}
