<?php

declare(strict_types=1);

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * DELETE /products/{product}, /products/{product}/force y /mangas/{manga}.
 *
 * `expected` es OPCIONAL (2026-10-09): lo manda el modal con vista previa para
 * que el borrado falle (422) si el stock, los apartados o los traslados
 * cambiaron mientras el usuario revisaba. La app móvil y los bundles viejos
 * del PWA no lo mandan y siguen funcionando igual.
 */
class DeleteProductRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'expected' => ['sometimes', 'nullable', 'array'],
            'expected.stock_total' => ['sometimes', 'nullable', 'numeric'],
            'expected.layaways' => ['sometimes', 'nullable', 'integer', 'min:0'],
            'expected.transfers_pending' => ['sometimes', 'nullable', 'integer', 'min:0'],
        ];
    }

    /** Conteos que vio el usuario, o null si el cliente no manda vista previa. */
    public function expected(): ?array
    {
        $expected = $this->validated()['expected'] ?? null;

        return is_array($expected) && $expected !== [] ? $expected : null;
    }
}
