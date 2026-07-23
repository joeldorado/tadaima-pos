<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StoreProductRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // auth via middleware
    }

    public function rules(): array
    {
        return [
            'name'          => ['required', 'string', 'max:255'],
            'sku'           => ['required', 'string', 'max:100', 'unique:products,sku'],
            'barcode'       => ['nullable', 'string', 'max:100'],
            'description'   => ['nullable', 'string'],
            'category_id'   => ['nullable', 'integer', 'exists:product_categories,id'],
            'supplier_id'   => ['nullable', 'integer', 'exists:suppliers,id'],
            'cost'          => ['nullable', 'numeric', 'min:0'],
            'active'        => ['boolean'],

            'prices'          => ['nullable', 'array'],
            'prices.price_1'  => ['nullable', 'numeric', 'min:0'],
            'prices.price_2'  => ['nullable', 'numeric', 'min:0'],
            'prices.price_3'  => ['nullable', 'numeric', 'min:0'],
            'prices.price_4'  => ['nullable', 'numeric', 'min:0'],
            'prices.price_5'  => ['nullable', 'numeric', 'min:0'],

            'allow_cash'    => ['boolean'],
            'allow_card'    => ['boolean'],

            // Tipo de producto: 'product' (default) o 'manga'. Cuando es manga
            // los detalles específicos pueden venir como sub-objeto o flat.
            'product_type'  => ['nullable', 'string', 'in:product,manga'],
            'manga_details'               => ['nullable', 'array'],
            'manga_details.volume_number' => ['nullable', 'integer', 'min:0', 'max:65535'],
            'manga_details.editorial'     => ['nullable', 'string', 'max:255'],
            'manga_details.genre'         => ['nullable', 'string', 'max:255'],
            'volume_number' => ['nullable', 'integer', 'min:0', 'max:65535'],
            'editorial'     => ['nullable', 'string', 'max:255'],
            'genre'         => ['nullable', 'string', 'max:255'],
        ];
    }

    /**
     * Al menos un método de pago (2026-07-24). Con ambos en false el producto
     * queda incobrable por cualquier método, y `getPayRestriction` del front
     * devuelve null → ni siquiera saca badge: se vuelve invendible en silencio.
     */
    public function withValidator(\Illuminate\Validation\Validator $validator): void
    {
        $validator->after(function (\Illuminate\Validation\Validator $v): void {
            if ($this->has('allow_cash') && $this->has('allow_card')
                && ! $this->boolean('allow_cash') && ! $this->boolean('allow_card')) {
                $v->errors()->add('allow_cash', 'El producto necesita aceptar al menos un método de pago (efectivo o tarjeta).');
            }
        });
    }

}
