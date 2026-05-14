<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class CreateStoreRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            // Opcional: si no se envía, el controller lo deriva del usuario autenticado.
            'company_id' => ['nullable', 'integer', 'exists:companies,id'],
            'name'       => ['required', 'string', 'max:150'],
            'address'    => ['nullable', 'string', 'max:255'],
            'phone'      => ['nullable', 'string', 'max:20'],
            'email'      => ['nullable', 'email', 'max:150'],
            'manager_id' => ['nullable', 'integer', 'exists:users,id'],
            'active'     => ['nullable', 'boolean'],
        ];
    }
}
