<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreLayawayRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'store_id'          => ['required', 'integer', 'exists:stores,id'],
            'customer_id'       => ['required', 'integer', 'exists:customers,id'],
            'product_id'        => ['required', 'integer', 'exists:products,id'],
            'warehouse_id'      => ['nullable', 'integer', 'exists:warehouses,id'],
            'quantity'          => ['sometimes', 'integer', 'min:1'],
            'price'             => ['nullable', 'numeric', 'min:0'],
            'down_payment'      => ['required', 'numeric', 'min:0.01'],
            'payment_method_id' => ['nullable', 'integer', 'exists:payment_methods,id'],
            'expires_at'        => ['nullable', 'date', 'after:today'],
            'notes'             => ['nullable', 'string', 'max:1000'],
        ];
    }
}
