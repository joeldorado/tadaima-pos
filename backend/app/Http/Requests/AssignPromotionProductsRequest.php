<?php

declare(strict_types=1);

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/** POST /promotions/{promotion}/products — asignación batch de productos. */
class AssignPromotionProductsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // RBAC en el controller (mismo patrón que promos).
    }

    public function rules(): array
    {
        return [
            'product_ids'   => ['required', 'array', 'min:1'],
            'product_ids.*' => ['integer', 'exists:products,id'],
        ];
    }

    public function messages(): array
    {
        return [
            'product_ids.required' => 'Manda al menos un producto para asignar.',
            'product_ids.*.exists' => 'Uno de los productos no existe.',
        ];
    }
}
