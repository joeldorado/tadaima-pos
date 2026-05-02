<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreTerminalRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'store_id'           => ['required', 'integer', 'exists:stores,id'],
            'name'               => ['required', 'string', 'max:100'],
            'commission_percent' => ['nullable', 'numeric', 'min:0', 'max:100'],
            'active'             => ['nullable', 'boolean'],
        ];
    }
}
