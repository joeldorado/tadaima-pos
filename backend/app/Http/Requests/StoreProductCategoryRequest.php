<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreProductCategoryRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'name'        => ['required', 'string', 'max:100', 'unique:product_categories,name'],
            'description' => ['nullable', 'string', 'max:500'],
            'active'      => ['nullable', 'boolean'],
        ];
    }
}
