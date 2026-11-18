<?php

namespace App\Http\Requests;

use Illuminate\Contracts\Validation\Validator;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Cobro mixto de Caja (2026-11-17): una mesa que mezcla preventa y venta se
 * cobra en UNA sola operación — `POST /sales/mixed`.
 *
 * Tres bloques, validados con las mismas reglas que sus endpoints de siempre:
 *  - `liquidation`: el folio cargado y las partidas que se entregan, su cobro
 *    y sus descuentos — reglas de `UpdatePreSaleOrderStatusRequest`.
 *  - `sale`: la venta regular de la mesa — reglas de `CheckoutRequest`.
 *  - `new_order`: una preventa nueva — reglas de `StorePreSaleOrderRequest`.
 *
 * Los tres son opcionales, pero tiene que venir `liquidation` o `new_order`:
 * una venta sola se cobra con `POST /sales`.
 *
 * `store_id`, `register_session_id` y `customer_id` son de toda la operación.
 */
class MixedCheckoutRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'store_id'            => ['required', 'integer', 'exists:stores,id'],
            'register_session_id' => ['required', 'integer', 'exists:cash_register_sessions,id'],
            // Una preventa nueva siempre lleva cliente (el folio cargado ya lo trae).
            'customer_id'         => ['required_with:new_order', 'nullable', 'integer', 'exists:customers,id'],

            // ── Folio que se entrega ──────────────────────────────────────────
            // Un cobro mixto lleva un folio que se entrega, una preventa nueva
            // o las dos cosas. Una venta sola es `POST /sales`.
            'liquidation'                   => ['required_without:new_order', 'filled', 'array'],
            'liquidation.pre_sale_order_id' => ['required_with:liquidation', 'integer', 'exists:pre_sale_orders,id'],
            'liquidation.notes'             => ['nullable', 'string', 'max:1000'],
            ...UpdatePreSaleOrderStatusRequest::deliveryRules('liquidation.'),
            // Aquí las partidas SIEMPRE viajan. Sin ellas `liquidate()` cae al
            // modo de la app móvil: entrega todo lo que llegó sin validar el
            // dinero ni registrar la entrega (no se podría revertir exacta).
            'liquidation.item_ids' => ['required_with:liquidation', 'array', 'min:1'],

            // ── Venta regular (siempre con el recálculo del servidor, v2) ─────
            // `filled`: un bloque vacío (`sale: {}`) es un payload mal armado, no
            // «sin venta». Para no mandar venta, el bloque no viaja.
            'sale'                   => ['sometimes', 'filled', 'array'],
            'sale.calc_version'      => ['required_with:sale', 'integer', 'in:2'],
            'sale.items'             => ['required_with:sale', 'array', 'min:1'],
            ...CheckoutRequest::saleLineRules('sale.items', true),
            'sale.payments'                     => ['required_with:sale', 'array', 'min:1'],
            'sale.payments.*.payment_method_id' => ['required', 'integer', 'exists:payment_methods,id'],
            // min:0: una parte regular solo de regalos se cobra con un pago de $0.
            'sale.payments.*.amount'            => ['required', 'numeric', 'min:0'],
            'sale.payments.*.terminal_id'       => ['nullable', 'integer', 'exists:terminals,id'],
            // Informativos (ticket, Historial, corte): no alteran el total.
            'sale.cash_received_usd' => ['nullable', 'numeric', 'min:0'],
            'sale.exchange_rate'     => ['nullable', 'numeric', 'min:0'],
            'sale.cash_received'     => ['nullable', 'numeric', 'min:0'],
            'sale.change_amount'     => ['nullable', 'numeric', 'min:0'],

            // ── Preventa nueva ────────────────────────────────────────────────
            'new_order'       => ['sometimes', 'filled', 'array'],
            'new_order.items' => ['required_with:new_order', 'array', 'min:1'],
            ...StorePreSaleOrderRequest::orderRules('new_order.'),
        ];
    }

    public function messages(): array
    {
        return [
            'liquidation.required_without' => 'El cobro mixto lleva un folio de preventa que se entrega o una preventa nueva.',
            'liquidation.filled'        => 'El folio de preventa viene vacío.',
            'liquidation.item_ids.required_with' => 'Faltan las piezas del folio que se entregan. Vuelve a cargar el folio en Caja.',
            'sale.filled'               => 'La venta viene vacía.',
            'new_order.filled'          => 'La preventa nueva viene vacía.',
            'sale.payments.required_with' => 'Se requiere al menos un método de pago.',
            'sale.payments.min'         => 'Se requiere al menos un método de pago.',
            'sale.items.min'            => 'Se requiere al menos un producto en la venta.',
            'customer_id.required_with' => 'Se requiere un cliente para crear un folio de preventa.',
            'new_order.items.required_with' => 'El folio debe tener al menos un producto.',
            'new_order.items.*.catalog_id.exists' => 'El catálogo seleccionado no existe.',
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $v): void {
            CheckoutRequest::validateSaleLines($v, (array) $this->input('sale.items', []), 'sale.items');

            $discounts = $this->input('liquidation.item_discounts');
            if (is_array($discounts) && $discounts !== []) {
                UpdatePreSaleOrderStatusRequest::validateItemDiscounts(
                    $v,
                    $discounts,
                    (array) $this->input('liquidation.item_ids', []),
                    'liquidation.',
                );
            }
        });
    }
}
