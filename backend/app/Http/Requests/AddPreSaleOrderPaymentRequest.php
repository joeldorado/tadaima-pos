<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class AddPreSaleOrderPaymentRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'amount'            => ['required', 'numeric', 'min:0.01'],
            'payment_method_id' => ['nullable', 'integer', 'exists:payment_methods,id'],
            'notes'             => ['nullable', 'string', 'max:1000'],
        ];
    }
}
