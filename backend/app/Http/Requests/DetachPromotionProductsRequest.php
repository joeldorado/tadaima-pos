<?php

declare(strict_types=1);

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/** POST /promotions/{promotion}/products/detach — quitar VARIOS productos de un jalón. */
class DetachPromotionProductsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // RBAC en el controller (mismo patrón que promos).
    }

    public function rules(): array
    {
        return [
            'product_ids'   => ['required', 'array', 'min:1', 'max:' . AssignPromotionProductsRequest::MAX_PRODUCTS],
            // Sin `exists`: quitar es idempotente — un producto que ya no está
            // (o ya ni existe) simplemente no tiene nada que quitar.
            'product_ids.*' => ['integer'],
        ];
    }

    public function messages(): array
    {
        return [
            'product_ids.required' => 'Manda al menos un producto para quitar.',
            'product_ids.max'      => 'Quita máximo ' . AssignPromotionProductsRequest::MAX_PRODUCTS . ' productos por envío.',
        ];
    }
}
