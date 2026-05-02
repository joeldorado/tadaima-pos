<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateSalesDraftItemRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'quantity' => ['required', 'numeric', 'min:0.01'],
            // Permitir cambiar precio en edición (ej. descuento manual)
            'price'    => ['nullable', 'numeric', 'min:0'],
        ];
    }
}
