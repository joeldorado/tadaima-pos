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
            // Anticipo en lista (2026-11-23, autorizado por Pier): Tarjeta con su
            // terminal o Mixto (efectivo + transferencia). Si viene, manda sobre
            // advance_amount/payment_method_id. La app móvil sigue con los de siempre.
            ...self::paymentListRules("{$prefix}payments"),

            "{$prefix}notes"               => ['nullable', 'string', 'max:1000'],
        ];
    }

    /**
     * Reglas de una lista de pagos de preventa (máx. 2 = Mixto). Las reglas de
     * negocio (Mixto sin tarjeta, terminal solo con tarjeta) viven en
     * `App\Support\PresalePayments`.
     *
     * @return array<string, array<int, mixed>>
     */
    public static function paymentListRules(string $key): array
    {
        return [
            $key                         => ['sometimes', 'array', 'min:1', 'max:' . \App\Support\PresalePayments::MAX_PAYMENTS],
            "{$key}.*.amount"            => ['required', 'numeric', 'min:0.01'],
            "{$key}.*.payment_method_id" => ['required', 'integer', 'exists:payment_methods,id'],
            "{$key}.*.terminal_id"       => ['nullable', 'integer', 'exists:terminals,id'],
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
