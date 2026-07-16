<?php

declare(strict_types=1);

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreSupplyRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name'      => ['required', 'string', 'max:100'],
            // null = insumo de toda la empresa; con valor = solo esa tienda.
            'store_id'  => ['nullable', 'integer', 'exists:stores,id'],
            'category'  => ['nullable', 'string', 'max:50'],
            'unit'      => ['nullable', 'string', 'max:20'],
            'is_active' => ['nullable', 'boolean'],
        ];
    }
}
