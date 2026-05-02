<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdatePreSaleRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'customer_id'       => ['nullable', 'integer', 'exists:customers,id'],
            'product_name'      => ['sometimes', 'string', 'max:255'],
            'advance_payment'   => ['nullable', 'numeric', 'min:0'],
            'preorder_limit'    => ['nullable', 'integer', 'min:0'],
            'reserved_quantity' => ['sometimes', 'integer', 'min:1'],
            'pickup_deadline'   => ['nullable', 'date'],
            'cost'              => ['nullable', 'numeric', 'min:0'],
            'margin_percent'    => ['nullable', 'numeric', 'min:0', 'max:100'],
            'category_id'       => ['nullable', 'integer', 'exists:product_categories,id'],
            'supplier_id'       => ['nullable', 'integer', 'exists:suppliers,id'],
            'price_1'           => ['nullable', 'numeric', 'min:0'],
            'price_2'           => ['nullable', 'numeric', 'min:0'],
            'price_3'           => ['nullable', 'numeric', 'min:0'],
            'price_4'           => ['nullable', 'numeric', 'min:0'],
            'price_5'           => ['nullable', 'numeric', 'min:0'],
            'status'            => ['nullable', 'in:live,paused'],
        ];
    }
}
