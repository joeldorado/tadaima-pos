<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateUserRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        $userId = $this->route('user')?->id;

        return [
            'name'          => ['sometimes', 'string', 'max:255'],
            'email'         => ['sometimes', 'email', "unique:users,email,{$userId}"],
            'password'      => ['nullable', 'string', 'min:8'],
            'phone'         => ['nullable', 'string', 'max:20'],
            'address'       => ['nullable', 'string', 'max:500'],
            'company_id'    => ['nullable', 'integer', 'exists:companies,id'],
            'store_id'      => ['nullable', 'integer', 'exists:stores,id'],
            'active'           => ['nullable', 'boolean'],
            'can_view_cost'    => ['nullable', 'boolean'],
            'can_edit_catalog' => ['nullable', 'boolean'],
        ];
    }
}
