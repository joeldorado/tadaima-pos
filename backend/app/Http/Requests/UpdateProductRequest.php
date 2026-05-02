<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateProductRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $productId = $this->route('product');

        return [
            'name'          => ['sometimes', 'string', 'max:255'],
            'sku'           => ['sometimes', 'string', 'max:100', Rule::unique('products', 'sku')->ignore($productId)],
            'barcode'       => ['nullable', 'string', 'max:100'],
            'description'   => ['nullable', 'string'],
            'category_id'   => ['nullable', 'integer', 'exists:product_categories,id'],
            'cost'          => ['nullable', 'numeric', 'min:0'],
            'active'        => ['boolean'],

            'prices'          => ['nullable', 'array'],
            'prices.price_1'  => ['nullable', 'numeric', 'min:0'],
            'prices.price_2'  => ['nullable', 'numeric', 'min:0'],
            'prices.price_3'  => ['nullable', 'numeric', 'min:0'],
            'prices.price_4'  => ['nullable', 'numeric', 'min:0'],
            'prices.price_5'  => ['nullable', 'numeric', 'min:0'],

            'allow_cash'    => ['boolean'],
            'allow_card'    => ['boolean'],
        ];
    }
}
