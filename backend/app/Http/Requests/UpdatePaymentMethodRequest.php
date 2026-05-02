<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdatePaymentMethodRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'name'   => ['sometimes', 'string', 'max:100', Rule::unique('payment_methods', 'name')->ignore($this->route('payment_method'))],
            'active' => ['sometimes', 'boolean'],
        ];
    }
}
