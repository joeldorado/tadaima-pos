<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StorePreSaleRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'store_id'          => ['nullable', 'integer', 'exists:stores,id'],
            'customer_id'       => ['nullable', 'integer', 'exists:customers,id'],
            'product_name'      => ['required', 'string', 'max:255'],
            'advance_payment'   => ['nullable', 'numeric', 'min:0'],
            'preorder_limit'    => ['nullable', 'integer', 'min:0'],
            'reserved_quantity' => ['required', 'integer', 'min:1'],
            'pickup_deadline'   => ['nullable', 'date', 'after:today'],
            'cost'              => ['nullable', 'numeric', 'min:0'],
            'margin_percent'    => ['nullable', 'numeric', 'min:0', 'max:100'],
            'category_id'       => ['nullable', 'integer', 'exists:product_categories,id'],
            'supplier_id'       => ['nullable', 'integer', 'exists:suppliers,id'],
            'price_1'           => ['nullable', 'numeric', 'min:0'],
            'price_2'           => ['nullable', 'numeric', 'min:0'],
            'price_3'           => ['nullable', 'numeric', 'min:0'],
            'price_4'           => ['nullable', 'numeric', 'min:0'],
            'price_5'           => ['nullable', 'numeric', 'min:0'],

            'status'               => ['nullable', 'in:live,paused'],

            'items'                => ['required', 'array', 'min:1'],
            'items.*.product_id'   => ['nullable', 'integer', 'exists:products,id'],
            'items.*.manga_id'     => ['nullable', 'integer', 'exists:mangas,id'],
            'items.*.quantity'     => ['required', 'numeric', 'min:0.01'],
            'items.*.price'        => ['nullable', 'numeric', 'min:0'],
            'items.*.price_level'  => ['nullable', 'integer', 'min:1', 'max:5'],
        ];
    }
}
