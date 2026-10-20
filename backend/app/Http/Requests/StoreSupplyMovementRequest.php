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
            // Tienda del movimiento (2026-10-12): solo el admin puede mandarlo —
            // el controller lo ignora para cajero/gerente (siempre su propia
            // tienda). null/omitido = "toda la empresa" para el admin.
            'store_id'  => ['nullable', 'integer', 'exists:stores,id'],
            // Origen del dinero (solo compras): caja (default) / caja_chica /
            // propio — con propio hay que decir QUIÉN puso el dinero.
            'money_source' => ['nullable', Rule::in(SupplyMovement::SOURCES)],
            'payer_name'   => [
                'nullable', 'string', 'max:100',
                'required_if:money_source,' . SupplyMovement::SOURCE_PROPIO,
            ],
        ];
    }

    public function messages(): array
    {
        return [
            'payer_name.required_if' => 'Indica quién puso el dinero.',
            'money_source.in'        => 'Origen del dinero inválido.',
        ];
    }
}
