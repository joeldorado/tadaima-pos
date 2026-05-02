<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreSalesDraftItemRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'product_id' => ['required', 'integer', 'exists:products,id'],
            'quantity'   => ['required', 'numeric', 'min:0.01'],
            // Si no se envía price, el controller lo obtiene de product_prices.price_1
            'price'      => ['nullable', 'numeric', 'min:0'],
        ];
    }
}
