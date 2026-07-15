<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Models\SupplyMovement;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreSupplyMovementRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $isPurchase = $this->input('type', SupplyMovement::TYPE_PURCHASE) === SupplyMovement::TYPE_PURCHASE;

        return [
            'supply_id' => ['required', 'integer', 'exists:supplies,id'],
            'type'      => ['nullable', Rule::in(SupplyMovement::TYPES)],
            'quantity'  => ['required', 'numeric', 'min:0.01'],
            // La compra saca efectivo de la caja → costo obligatorio > 0.
            // Consumo/ajuste no tocan caja → amount opcional (default 0).
            'amount'    => $isPurchase
                ? ['required', 'numeric', 'min:0.01']
                : ['nullable', 'numeric', 'min:0'],
            'note'      => ['nullable', 'string', 'max:255'],
        ];
    }
}
