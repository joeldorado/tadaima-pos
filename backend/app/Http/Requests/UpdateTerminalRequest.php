<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateTerminalRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'store_id'           => ['sometimes', 'integer', 'exists:stores,id'],
            'name'               => ['sometimes', 'string', 'max:100'],
            'commission_percent' => ['sometimes', 'numeric', 'min:0', 'max:100'],
            'active'             => ['sometimes', 'boolean'],
        ];
    }
}
