<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreWarehouseRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'company_id'  => ['required', 'integer', 'exists:companies,id'],
            'store_id'    => ['nullable', 'integer', 'exists:stores,id'],
            'name'        => ['required', 'string', 'max:150'],
            'type'        => ['nullable', 'in:central,store'],
            'description' => ['nullable', 'string', 'max:500'],
            'active'      => ['nullable', 'boolean'],
        ];
    }
}
