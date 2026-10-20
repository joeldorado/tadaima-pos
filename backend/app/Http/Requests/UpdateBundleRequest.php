<?php

declare(strict_types=1);

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

/** PUT /bundles/{id} — edición (composición solo sin stock; lo valida el service). */
class UpdateBundleRequest extends FormRequest
{
    use BundleComponentsRules;

    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $id = (int) $this->route('id');

        return array_merge([
            'name' => ['sometimes', 'string', 'max:255'],
            'description' => ['nullable', 'string', 'max:2000'],
            'sku' => ['sometimes', 'nullable', 'string', 'max:100', Rule::unique('products', 'sku')->ignore($id)],
            'barcode' => ['sometimes', 'nullable', 'string', 'regex:/^\d{13}$/', Rule::unique('products', 'barcode')->ignore($id)],
            'active' => ['boolean'],
            'catalog_visible' => ['boolean'],
            'prices' => ['sometimes', 'array'],
            'prices.price_1' => ['required_with:prices', 'numeric', 'gt:0', 'max:9999999.99'],
            'prices.price_2' => ['nullable', 'numeric', 'min:0', 'max:9999999.99'],
            'prices.price_3' => ['nullable', 'numeric', 'min:0', 'max:9999999.99'],
            'prices.price_4' => ['nullable', 'numeric', 'min:0', 'max:9999999.99'],
            'prices.price_5' => ['nullable', 'numeric', 'min:0', 'max:9999999.99'],
        ], $this->componentRules(false));
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(fn (Validator $v) => $this->validateComponentProducts($v, (int) $this->route('id')));
    }

    public function messages(): array
    {
        return array_merge([
            'sku.unique' => 'Ese SKU / código ya lo tiene otro producto.',
            'barcode.regex' => 'El código de barras debe tener 13 dígitos.',
            'barcode.unique' => 'Ese código de barras ya lo tiene otro producto.',
            'prices.price_1.required_with' => 'Escribe el precio normal del paquete.',
            'prices.price_1.gt' => 'El precio normal del paquete debe ser mayor a $0.',
        ], $this->componentMessages());
    }
}
