<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreUserRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'name'          => ['required', 'string', 'max:255'],
            'email'         => ['required', 'email', 'unique:users,email'],
            'password'      => ['required', 'string', 'min:8'],
            'phone'         => ['nullable', 'string', 'max:20'],
            'address'       => ['nullable', 'string', 'max:500'],
            'company_id'    => ['nullable', 'integer', 'exists:companies,id'],
            'store_id'      => ['nullable', 'integer', 'exists:stores,id'],
            'active'           => ['nullable', 'boolean'],
            'can_view_cost'    => ['nullable', 'boolean'],
            'can_edit_catalog' => ['nullable', 'boolean'],
            'role_id'          => ['nullable', 'integer', 'exists:roles,id'],
        ];
    }
}
