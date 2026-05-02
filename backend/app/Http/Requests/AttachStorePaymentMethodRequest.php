<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class AttachStorePaymentMethodRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'payment_method_id' => ['required', 'integer', 'exists:payment_methods,id'],
            'active'            => ['nullable', 'boolean'],
        ];
    }
}
