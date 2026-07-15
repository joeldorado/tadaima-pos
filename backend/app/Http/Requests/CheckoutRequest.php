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
        $isV2     = (int) $this->input('calc_version') === 2;

        return [
            'draft_id'   => [$hasItems ? 'nullable' : 'required', 'integer', 'exists:sales_drafts,id'],

            // Descuentos v2 (Fase 1): calc_version=2 activa el recompute
            // server-side por línea y SOLO existe en el checkout directo con
            // items. En v2 el descuento global legacy está PROHIBIDO (in:0 —
            // un negativo rompería el invariante discount ≥ 0 en reportes);
            // el monto lo calcula SaleCalculator, nunca el cliente.
            'calc_version' => ['nullable', 'integer', 'in:2', $hasItems ? 'sometimes' : 'prohibited'],
            'discount'     => $isV2
                ? ['nullable', 'numeric', 'in:0']
                : ['nullable', 'numeric', 'min:0'],

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

            // Descuento por línea (Descuentos v2). El cajero manda tipo/base/valor
            // + motivo; el MONTO lo recomputa el backend (SaleCalculator) — nunca
            // se acepta un monto pre-calculado del cliente.
            'items.*.line_discount'         => ['nullable', 'array'],
            'items.*.line_discount.kind'    => ['required_with:items.*.line_discount', 'string', 'in:fixed,percent'],
            'items.*.line_discount.basis'   => ['required_with:items.*.line_discount', 'string', 'in:unit,line'],
            'items.*.line_discount.value'   => ['required_with:items.*.line_discount', 'numeric', 'min:0.01', 'max:999999'],
            'items.*.line_discount.reason'  => ['required_with:items.*.line_discount', 'string', 'in:danado,caducidad,exhibicion,cortesia,otro'],
            'items.*.line_discount.note'    => ['nullable', 'string', 'max:255'],
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
            'discount.max'      => 'El descuento global ya no existe — usa descuentos por línea (calc_version 2).',
        ];
    }

    /**
     * Un porcentaje > 100 dejaría la línea negativa; el clamp del calculator lo
     * toparía, pero es señal de captura errónea → 422 explícito.
     */
    public function withValidator(\Illuminate\Validation\Validator $validator): void
    {
        $validator->after(function (\Illuminate\Validation\Validator $v): void {
            foreach ((array) $this->input('items', []) as $i => $item) {
                $d = $item['line_discount'] ?? null;
                if (is_array($d) && ($d['kind'] ?? '') === 'percent' && (float) ($d['value'] ?? 0) > 100) {
                    $v->errors()->add("items.{$i}.line_discount.value", 'El porcentaje de descuento no puede exceder 100.');
                }
            }
        });
    }
}
