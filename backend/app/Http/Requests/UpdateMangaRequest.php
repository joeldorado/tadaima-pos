<?php

namespace App\Http\Requests;

use App\Models\Product;
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
            // Igual que en StoreMangaRequest: code → products.sku (UNIQUE).
            // Aquí se ignora el propio tomo (guardar sin cambiar el código es válido).
            'code'                  => ['sometimes', 'nullable', 'string', 'max:50', $this->uniqueCodeRule()],
            'genre'                 => ['sometimes', 'nullable', 'string', 'max:100'],
            'public_price'          => ['sometimes', 'numeric', 'min:0'],
            'profit_margin_percent' => ['sometimes', 'numeric', 'min:0', 'max:100'],
            'active'                => ['sometimes', 'boolean'],
            // Categorías múltiples (2026-08-17)
            'category_ids'          => ['nullable', 'array'],
            'category_ids.*'        => ['integer', 'exists:product_categories,id'],
            'price_1'               => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'price_2'               => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'price_3'               => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'price_4'               => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'price_5'               => ['sometimes', 'nullable', 'numeric', 'min:0'],
            'stock'                 => ['sometimes', 'nullable', 'integer', 'min:0'],
        ];
    }

    /**
     * Rechaza códigos que ya pertenecen a OTRO producto (excluye el tomo que se
     * está editando), nombrando al dueño del código en el mensaje.
     */
    private function uniqueCodeRule(): \Closure
    {
        return function (string $attribute, mixed $value, \Closure $fail): void {
            if ($value === null || $value === '') {
                return;
            }
            $current = $this->route('manga');
            $currentId = is_object($current) ? $current->id : $current;
            $existing = Product::where('sku', $value)
                ->when($currentId, fn ($q) => $q->where('id', '!=', $currentId))
                ->first();
            if ($existing) {
                $fail("El código {$value} ya está registrado en «{$existing->name}». Usa otro código o edita ese producto.");
            }
        };
    }
}
