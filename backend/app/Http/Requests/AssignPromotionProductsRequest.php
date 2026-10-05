<?php

declare(strict_types=1);

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/** POST /promotions/{promotion}/products — asignación batch de productos. */
class AssignPromotionProductsRequest extends FormRequest
{
    /**
     * Tope por envío: cada producto corre sus reglas (tipo/duplicado/tope/pago),
     * así que una categoría entera se manda en varios lotes desde el front.
     */
    public const MAX_PRODUCTS = 500;

    public function authorize(): bool
    {
        return true; // RBAC en el controller (mismo patrón que promos).
    }

    public function rules(): array
    {
        return [
            'product_ids'   => ['required', 'array', 'min:1', 'max:' . self::MAX_PRODUCTS],
            'product_ids.*' => ['integer', 'exists:products,id'],
        ];
    }

    public function messages(): array
    {
        return [
            'product_ids.required' => 'Manda al menos un producto para asignar.',
            'product_ids.max'      => 'Asigna máximo ' . self::MAX_PRODUCTS . ' productos por envío.',
            'product_ids.*.exists' => 'Uno de los productos no existe.',
        ];
    }
}
