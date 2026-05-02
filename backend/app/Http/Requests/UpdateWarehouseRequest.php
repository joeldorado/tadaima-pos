<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateWarehouseRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'store_id'    => ['sometimes', 'nullable', 'integer', 'exists:stores,id'],
            'name'        => ['sometimes', 'string', 'max:150'],
            'type'        => ['sometimes', 'in:central,store'],
            'description' => ['sometimes', 'nullable', 'string', 'max:500'],
            'active'      => ['sometimes', 'boolean'],
        ];
    }
}
