<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdatePreSaleCatalogRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'product_name'    => ['sometimes', 'string', 'max:255'],
            'category_id'     => ['nullable', 'integer', 'exists:product_categories,id'],
            'supplier_id'     => ['nullable', 'integer', 'exists:suppliers,id'],
            'product_id'      => ['nullable', 'integer', 'exists:products,id'],
            'cost'            => ['nullable', 'numeric', 'min:0'],
            'margin_percent'  => ['nullable', 'numeric', 'min:0', 'max:100'],
            'price_1'         => ['sometimes', 'numeric', 'min:0.01'],
            'price_2'         => ['nullable', 'numeric', 'min:0'],
            'price_3'         => ['nullable', 'numeric', 'min:0'],
            'price_4'         => ['nullable', 'numeric', 'min:0'],
            'price_5'         => ['nullable', 'numeric', 'min:0'],
            'advance_payment' => ['nullable', 'numeric', 'min:0'],
            'preorder_limit'  => ['nullable', 'integer', 'min:1'],
            'arrival_date'    => ['nullable', 'date'],
            'pickup_deadline' => ['nullable', 'date', 'after_or_equal:arrival_date'],

            // Límites por tienda — opcional. Si se manda, reemplaza al preorder_limit
            // global como fuente de truth (ver PreSaleCatalog::limitForStore).
            'store_limits'              => ['nullable', 'array'],
            'store_limits.*.store_id'   => ['required_with:store_limits', 'integer', 'exists:stores,id'],
            'store_limits.*.limit_qty'  => ['required_with:store_limits', 'integer', 'min:0'],
        ];
    }
}
