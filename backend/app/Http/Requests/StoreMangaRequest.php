<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreMangaRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'name'                  => ['required', 'string', 'max:200'],
            'volume_number'         => ['nullable', 'integer', 'min:0'],
            'editorial'             => ['nullable', 'string', 'max:100'],
            'code'                  => ['nullable', 'string', 'max:50'],
            'genre'                 => ['nullable', 'string', 'max:100'],
            'public_price'          => ['required', 'numeric', 'min:0'],
            'profit_margin_percent' => ['required', 'numeric', 'min:0', 'max:100'],
            'active'                => ['nullable', 'boolean'],
            'price_1'               => ['nullable', 'numeric', 'min:0'],
            'price_2'               => ['nullable', 'numeric', 'min:0'],
            'price_3'               => ['nullable', 'numeric', 'min:0'],
            'price_4'               => ['nullable', 'numeric', 'min:0'],
            'price_5'               => ['nullable', 'numeric', 'min:0'],
            'stock'                 => ['nullable', 'integer', 'min:0'],
        ];
    }
}
