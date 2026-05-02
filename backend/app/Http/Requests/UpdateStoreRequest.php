<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateStoreRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'name'       => ['sometimes', 'string', 'max:150'],
            'address'    => ['sometimes', 'nullable', 'string', 'max:255'],
            'phone'      => ['sometimes', 'nullable', 'string', 'max:20'],
            'email'      => ['sometimes', 'nullable', 'email', 'max:150'],
            'manager_id' => ['sometimes', 'nullable', 'integer', 'exists:users,id'],
            'active'     => ['sometimes', 'boolean'],
        ];
    }
}
