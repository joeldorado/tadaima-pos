<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Services\ProductStockHistoryService;
use Illuminate\Foundation\Http\FormRequest;

/**
 * Filtros de GET /products/{product}/stock-history (Historial de stock,
 * 2026-11-19). El aislamiento por tienda lo decide el controller.
 */
class ProductStockHistoryRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'store_id'     => ['nullable', 'integer', 'exists:stores,id'],
            'warehouse_id' => ['nullable', 'integer', 'exists:warehouses,id'],
            'from'         => ['nullable', 'date_format:Y-m-d'],
            'to'           => ['nullable', 'date_format:Y-m-d', 'after_or_equal:from'],
            'page'         => ['nullable', 'integer', 'min:1'],
            'per_page'     => ['nullable', 'integer', 'min:1', 'max:'.ProductStockHistoryService::MAX_PER_PAGE],
        ];
    }

    public function messages(): array
    {
        return [
            'to.after_or_equal' => 'La fecha final no puede ser antes de la inicial.',
            'per_page.max'      => 'Máximo '.ProductStockHistoryService::MAX_PER_PAGE.' movimientos por página.',
        ];
    }
}
