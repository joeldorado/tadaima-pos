<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateProductCategoryRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'name'        => ['sometimes', 'string', 'max:100', Rule::unique('product_categories', 'name')->ignore($this->route('category'))],
            'description' => ['sometimes', 'nullable', 'string', 'max:500'],
            'active'      => ['sometimes', 'boolean'],
        ];
    }
}
