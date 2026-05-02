<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateCompanyRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'name'      => ['sometimes', 'string', 'max:150'],
            'rfc'       => ['sometimes', 'nullable', 'string', 'max:20'],
            'address'   => ['sometimes', 'nullable', 'string', 'max:255'],
            'phone'     => ['sometimes', 'nullable', 'string', 'max:20'],
            'email'     => ['sometimes', 'nullable', 'email', 'max:150'],
            'logo_path' => ['sometimes', 'nullable', 'string', 'max:500'],
            'active'    => ['sometimes', 'boolean'],
        ];
    }
}
