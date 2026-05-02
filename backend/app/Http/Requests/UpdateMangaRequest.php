<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateMangaRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'name'                  => ['sometimes', 'string', 'max:200'],
            'volume_number'         => ['sometimes', 'nullable', 'integer', 'min:0'],
            'editorial'             => ['sometimes', 'nullable', 'string', 'max:100'],
            'code'                  => ['sometimes', 'nullable', 'string', 'max:50'],
            'genre'                 => ['sometimes', 'nullable', 'string', 'max:100'],
            'public_price'          => ['sometimes', 'numeric', 'min:0'],
            'profit_margin_percent' => ['sometimes', 'numeric', 'min:0', 'max:100'],
            'active'                => ['sometimes', 'boolean'],
            'price_1'               => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'price_2'               => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'price_3'               => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'price_4'               => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'price_5'               => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'stock'                 => ['sometimes', 'nullable', 'integer', 'min:0'],
        ];
    }
}
