<?php

namespace App\Http\Requests;

use App\Models\Product;
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
            // El code se guarda como products.sku (UNIQUE). Sin esta regla, un
            // código repetido tronaba con QueryException → 500 "Server Error"
            // sin explicación para el cajero (bug reportado 2026-08-31).
            'code'                  => ['nullable', 'string', 'max:50', $this->uniqueCodeRule()],
            'genre'                 => ['nullable', 'string', 'max:100'],
            'public_price'          => ['required', 'numeric', 'min:0'],
            'profit_margin_percent' => ['required', 'numeric', 'min:0', 'max:100'],
            'active'                => ['nullable', 'boolean'],
            // Categorías múltiples (2026-08-17)
            'category_ids'          => ['nullable', 'array'],
            'category_ids.*'        => ['integer', 'exists:product_categories,id'],
            'price_1'               => ['nullable', 'numeric', 'min:0'],
            'price_2'               => ['nullable', 'numeric', 'min:0'],
            'price_3'               => ['nullable', 'numeric', 'min:0'],
            'price_4'               => ['nullable', 'numeric', 'min:0'],
            'price_5'               => ['nullable', 'numeric', 'min:0'],
            'stock'                 => ['nullable', 'integer', 'min:0'],
        ];
    }

    /**
     * Rechaza códigos que ya existen como SKU de otro producto, nombrando al
     * dueño del código para que el cajero sepa exactamente qué chocó.
     */
    private function uniqueCodeRule(): \Closure
    {
        return function (string $attribute, mixed $value, \Closure $fail): void {
            if ($value === null || $value === '') {
                return;
            }
            $existing = Product::where('sku', $value)->first();
            if ($existing) {
                $fail("El código {$value} ya está registrado en «{$existing->name}». Usa otro código o edita ese producto.");
            }
        };
    }
}
