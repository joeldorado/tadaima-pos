<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class OpenCashSessionRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            // Se acepta abrir por tienda (la UI siempre la conoce) o por caja
            // existente. Al menos uno es obligatorio. Abrir por `store_id`
            // permite estrenar caja en una tienda que aún no tiene ninguna.
            'store_id'     => ['nullable', 'integer', 'exists:stores,id', 'required_without:register_id'],
            'register_id'  => ['nullable', 'integer', 'exists:cash_registers,id', 'required_without:store_id'],
            'opening_cash' => ['required', 'numeric', 'min:0'],
        ];
    }
}
