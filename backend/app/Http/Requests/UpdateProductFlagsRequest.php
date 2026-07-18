<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

/**
 * PUT /catalog/product-flags/{product} — flags del Catálogo Online por
 * producto (destacado / visible). Superficie mínima a propósito: NO abre
 * la edición general de producto (eso vive en ProductController).
 */
class UpdateProductFlagsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // RBAC en el controller (catalogEditError)
    }

    public function rules(): array
    {
        return [
            'featured'        => ['sometimes', 'boolean'],
            'catalog_visible' => ['sometimes', 'boolean'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $v) {
            if (!$this->has('featured') && !$this->has('catalog_visible')) {
                $v->errors()->add('featured', 'Envía al menos un campo: featured o catalog_visible.');
            }
        });
    }

    public function messages(): array
    {
        return [
            'featured.boolean'        => 'featured debe ser booleano.',
            'catalog_visible.boolean' => 'catalog_visible debe ser booleano.',
        ];
    }
}
