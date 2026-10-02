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
            // Tope (2026-10-01): un corte de prueba abrió con $6,632,262,600 por
            // un error al teclear y descuadró la vista de todas las tiendas.
            'opening_cash' => ['required', 'numeric', 'min:0', 'max:1000000'],
        ];
    }

    public function messages(): array
    {
        return [
            'opening_cash.max' => 'El fondo inicial no puede pasar de $1,000,000. Revisa el monto.',
        ];
    }
}
