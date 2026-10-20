<?php

declare(strict_types=1);

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/** POST /bundles/{id}/disassemble — desarmar N paquetes y regresar las piezas. */
class DisassembleBundleRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'store_id' => ['required', 'integer', 'exists:stores,id'],
            'quantity' => ['required', 'integer', 'min:1', 'max:9999'],
            'notes' => ['nullable', 'string', 'max:500'],
            'destination' => ['nullable', 'string', 'in:store,bodega'],
        ];
    }

    public function messages(): array
    {
        return [
            'store_id.required' => 'Elige en qué tienda desarmar.',
            'quantity.required' => 'Escribe cuántos paquetes desarmar.',
            'quantity.min' => 'La cantidad a desarmar debe ser al menos 1.',
            'quantity.max' => 'No se pueden desarmar más de 9,999 paquetes de una vez.',
            'destination.in' => 'Destino inválido: elige Exhibición o Bodega.',
        ];
    }
}
