<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * PUT /sales/{sale}/payments — corregir el método de pago de una venta ya
 * cobrada (2026-09-30). El permiso (tienda + caja abierta / admin) lo revisa el
 * controller; las reglas de negocio, SalePaymentCorrectionService.
 */
class CorrectSalePaymentsRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'payments'                     => ['required', 'array', 'min:1', 'max:2'],
            'payments.*.payment_method_id' => ['required', 'integer', 'exists:payment_methods,id'],
            'payments.*.amount'            => ['required', 'numeric', 'min:0.01'],
            'payments.*.terminal_id'       => ['nullable', 'integer', 'exists:terminals,id'],
            // Obligatorio: queda en el log y el gerente lo ve si algo no cuadra.
            'reason'                       => ['required', 'string', 'min:3', 'max:255'],
        ];
    }
}
