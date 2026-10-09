<?php

declare(strict_types=1);

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

/** POST /bundles — alta de un paquete (Paquetes, 2026-10-07). */
class StoreBundleRequest extends FormRequest
{
    use BundleComponentsRules;

    public function authorize(): bool
    {
        return true; // cualquier rol crea paquetes (gating de tienda en el controller)
    }

    public function rules(): array
    {
        return array_merge([
            'name' => ['required', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:2000'],
            'sku' => ['nullable', 'string', 'max:100', 'unique:products,sku'],
            'barcode' => ['nullable', 'string', 'regex:/^\d{13}$/', 'unique:products,barcode'],
            'active' => ['boolean'],
            'catalog_visible' => ['boolean'],
            'prices' => ['required', 'array'],
            'prices.price_1' => ['required', 'numeric', 'gt:0', 'max:9999999.99'],
            'prices.price_2' => ['nullable', 'numeric', 'min:0', 'max:9999999.99'],
            'prices.price_3' => ['nullable', 'numeric', 'min:0', 'max:9999999.99'],
            'prices.price_4' => ['nullable', 'numeric', 'min:0', 'max:9999999.99'],
            'prices.price_5' => ['nullable', 'numeric', 'min:0', 'max:9999999.99'],
        ], $this->componentRules(true));
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(fn (Validator $v) => $this->validateComponentProducts($v));
    }

    public function messages(): array
    {
        return array_merge([
            'name.required' => 'Ponle nombre al paquete.',
            'sku.unique' => 'Ese SKU / código ya lo tiene otro producto.',
            'barcode.regex' => 'El código de barras debe tener 13 dígitos.',
            'barcode.unique' => 'Ese código de barras ya lo tiene otro producto.',
            'prices.required' => 'Escribe el precio normal del paquete.',
            'prices.price_1.required' => 'Escribe el precio normal del paquete.',
            'prices.price_1.gt' => 'El precio normal del paquete debe ser mayor a $0.',
        ], $this->componentMessages());
    }
}
