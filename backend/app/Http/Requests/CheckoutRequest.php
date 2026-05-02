<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class CheckoutRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'draft_id'   => ['required', 'integer', 'exists:sales_drafts,id'],
            'discount'   => ['nullable', 'numeric', 'min:0'],

            'payments'                      => ['required', 'array', 'min:1'],
            'payments.*.payment_method_id'  => ['required', 'integer', 'exists:payment_methods,id'],
            'payments.*.amount'             => ['required', 'numeric', 'min:0.01'],
            'payments.*.terminal_id'        => ['nullable', 'integer', 'exists:terminals,id'],
        ];
    }

    public function messages(): array
    {
        return [
            'payments.required' => 'Se requiere al menos un método de pago.',
            'payments.min'      => 'Se requiere al menos un método de pago.',
        ];
    }
}
