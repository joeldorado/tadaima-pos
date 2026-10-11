<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdatePreSaleCatalogStatusRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'status' => ['required', 'in:draft,published,arrived,closed,cancelled,completed'],
            // Solo para `cancelled` (2026-10-09): los conteos que el usuario vio
            // en la vista previa. Opcional: clientes viejos no lo mandan.
            'expected' => ['sometimes', 'nullable', 'array'],
            'expected.to_cancel' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'expected.with_money' => ['sometimes', 'nullable', 'integer', 'min:0'],
        ];
    }

    /** Conteos de la vista previa, o null si el cliente no los manda. */
    public function expected(): ?array
    {
        $expected = $this->validated()['expected'] ?? null;

        return is_array($expected) && $expected !== [] ? $expected : null;
    }
}
