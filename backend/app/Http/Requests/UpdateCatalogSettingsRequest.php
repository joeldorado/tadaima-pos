<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateCatalogSettingsRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        $storeId = $this->route('store')?->id ?? $this->route('store');

        return [
            'catalog_url' => [
                'sometimes', 'nullable', 'string', 'max:100', 'alpha_dash',
                Rule::unique('catalog_settings', 'catalog_url')->where('store_id', '!=', $storeId),
            ],
            'show_price'  => ['sometimes', 'boolean'],
            'show_stock'  => ['sometimes', 'boolean'],
        ];
    }
}
