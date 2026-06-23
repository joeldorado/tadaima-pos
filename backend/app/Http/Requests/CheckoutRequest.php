<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class CheckoutRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        // Soporta dos shapes:
        //  A) {draft_id} — legacy / compat con código viejo que crea draft en backend
        //  B) {items, store_id, register_session_id, customer_id?} — nuevo flujo
        //     client-authoritative donde el carrito vive solo en frontend y al
        //     cobrar se manda directo. Backend crea draft+items+sale atomico.
        $hasItems = $this->has('items');

        return [
            'draft_id'   => [$hasItems ? 'nullable' : 'required', 'integer', 'exists:sales_drafts,id'],
            'discount'   => ['nullable', 'numeric', 'min:0'],

            // Dólares físicos recibidos en esta venta + TC usado (informativo,
            // para Historial/Corte/Reporte). El MXN equivalente ya viene en los
            // montos de payments; esto NO altera el total.
            'cash_received_usd' => ['nullable', 'numeric', 'min:0'],
            'exchange_rate'     => ['nullable', 'numeric', 'min:0'],

            // Desglose del efectivo: total entregado en MXN (incluye USD ya
            // convertido a TC) + cambio devuelto. Informativo, para el ticket y
            // el detalle del Historial. NULL en pagos con tarjeta/transferencia.
            'cash_received'     => ['nullable', 'numeric', 'min:0'],
            'change_amount'     => ['nullable', 'numeric', 'min:0'],

            'payments'                      => ['required', 'array', 'min:1'],
            'payments.*.payment_method_id'  => ['required', 'integer', 'exists:payment_methods,id'],
            'payments.*.amount'             => ['required', 'numeric', 'min:0.01'],
            'payments.*.terminal_id'        => ['nullable', 'integer', 'exists:terminals,id'],

            // Shape B: items directos
            'items'                         => [$hasItems ? 'required' : 'nullable', 'array', 'min:1'],
            'items.*.product_id'            => ['required_with:items', 'integer', 'exists:products,id'],
            'items.*.quantity'              => ['required_with:items', 'numeric', 'min:0.01'],
            'items.*.price'                 => ['required_with:items', 'numeric', 'min:0'],
            'items.*.price_level'           => ['nullable', 'string', 'in:a,b,c'],
            // Producto dañado → precio manual permitido fuera del catálogo. Sin
            // este flag el precio se valida contra los niveles del catálogo.
            'items.*.is_damaged'            => ['nullable', 'boolean'],
            'store_id'                      => [$hasItems ? 'required' : 'nullable', 'integer', 'exists:stores,id'],
            'register_session_id'           => [$hasItems ? 'required' : 'nullable', 'integer', 'exists:cash_register_sessions,id'],
            'customer_id'                   => ['nullable', 'integer', 'exists:customers,id'],
        ];
    }

    public function messages(): array
    {
        return [
            'payments.required' => 'Se requiere al menos un método de pago.',
            'payments.min'      => 'Se requiere al menos un método de pago.',
            'items.min'         => 'Se requiere al menos un producto en la venta.',
        ];
    }
}
