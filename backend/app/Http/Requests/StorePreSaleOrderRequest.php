<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class StorePreSaleOrderRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'store_id'              => ['required', 'integer', 'exists:stores,id'],
            'customer_id'           => ['required', 'integer', 'exists:customers,id'],

            'items'                 => ['required', 'array', 'min:1'],
            ...self::orderRules(),

            'linked_sale_id'        => ['nullable', 'integer', 'exists:sales,id'],
        ];
    }

    /**
     * Reglas de las partidas, el anticipo y las notas de un folio nuevo.
     * `$prefix` es el bloque donde viven (vacío aquí, `new_order.` en el cobro
     * mixto).
     *
     * @return array<string, array<int, mixed>>
     */
    public static function orderRules(string $prefix = ''): array
    {
        return [
            "{$prefix}items.*.catalog_id"  => ['required', 'integer', 'exists:pre_sale_catalogs,id'],
            "{$prefix}items.*.quantity"    => ['required', 'integer', 'min:1'],
            "{$prefix}items.*.price_level" => ['required', 'integer', 'min:1', 'max:5'],

            // Anticipo inicial — obligatorio por diseño de negocio si el catálogo lo requiere
            "{$prefix}advance_amount"      => ['nullable', 'numeric', 'min:0'],
            "{$prefix}payment_method_id"   => ['nullable', 'integer', 'exists:payment_methods,id'],

            "{$prefix}notes"               => ['nullable', 'string', 'max:1000'],
        ];
    }

    public function messages(): array
    {
        return [
            'customer_id.required' => 'Se requiere un cliente para crear un folio de preventa.',
            'items.required'       => 'El folio debe tener al menos un producto.',
            'items.*.catalog_id.exists' => 'El catálogo seleccionado no existe.',
        ];
    }
}
