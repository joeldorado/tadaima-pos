<?php

declare(strict_types=1);

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/** POST /bundles/{id}/assemble — armar N paquetes en una tienda. */
class AssembleBundleRequest extends FormRequest
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
            'sources' => ['nullable', 'array'],
            'sources.*.product_id' => ['required', 'integer'],
            'sources.*.source' => ['required', 'string', 'in:auto,store,bodega'],
        ];
    }

    public function messages(): array
    {
        return [
            'store_id.required' => 'Elige en qué tienda armar.',
            'quantity.required' => 'Escribe cuántos paquetes armar.',
            'quantity.min' => 'La cantidad a armar debe ser al menos 1.',
            'quantity.max' => 'No se pueden armar más de 9,999 paquetes de una vez.',
            'sources.*.source.in' => 'Origen inválido: elige Automático, Exhibición o Bodega.',
        ];
    }

    /** @return array<int, string> product_id => auto|store|bodega */
    public function sourcesMap(): array
    {
        $map = [];
        foreach ((array) $this->input('sources', []) as $row) {
            if (is_array($row) && isset($row['product_id'], $row['source'])) {
                $map[(int) $row['product_id']] = (string) $row['source'];
            }
        }

        return $map;
    }
}
