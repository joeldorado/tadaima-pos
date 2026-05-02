<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreSalesDraftRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'store_id'            => ['required', 'integer', 'exists:stores,id'],
            'customer_id'         => ['nullable', 'integer', 'exists:customers,id'],
            'register_session_id' => ['nullable', 'integer', 'exists:cash_register_sessions,id'],
        ];
    }
}
