<?php

declare(strict_types=1);

namespace App\Http\Requests;

use App\Models\ProductPromotion;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;
use Illuminate\Validation\Validator;

class StoreProductPromotionRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $type = $this->promoType();

        return [
            'name'      => ['required', 'string', 'max:100'],
            'type'      => ['nullable', Rule::in(ProductPromotion::TYPES)],
            // NxM: buy_n/pay_m obligatorios. qty_discount: prohibidos.
            'buy_n'     => $type === ProductPromotion::TYPE_NXM
                ? ['required', 'integer', 'min:2', 'max:100']
                : ['prohibited'],
            'pay_m'     => $type === ProductPromotion::TYPE_NXM
                ? ['required', 'integer', 'min:1']
                : ['prohibited'],
            // qty_discount: escalones [{qty, amount}] — qty ≥2 única, amount > 0.
            'tiers'            => $type === ProductPromotion::TYPE_QTY_DISCOUNT
                ? ['required', 'array', 'min:1', 'max:10']
                : ['prohibited'],
            'tiers.*.qty'      => ['integer', 'min:2', 'max:100', 'distinct'],
            'tiers.*.amount'   => ['numeric', 'gt:0', 'max:999999'],
            'starts_at' => ['nullable', 'date'],
            'ends_at'   => ['nullable', 'date', 'after_or_equal:starts_at'],
            'status'    => ['nullable', Rule::in(ProductPromotion::STATUSES)],
            // null = todas las tiendas (compat con promos existentes).
            'store_id'  => ['nullable', 'integer', 'exists:stores,id'],
            'priority'  => ['nullable', 'integer', 'min:0', 'max:999'],
        ];
    }

    /** Tipo efectivo de la promo (default nxm — compat con clientes viejos). */
    public function promoType(): string
    {
        $type = (string) $this->input('type', ProductPromotion::TYPE_NXM);

        return in_array($type, ProductPromotion::TYPES, true) ? $type : ProductPromotion::TYPE_NXM;
    }

    /** pay_m < buy_n — "compra 2 paga 2" no es promo y rompería el motor. */
    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $v): void {
            if ($this->promoType() !== ProductPromotion::TYPE_NXM) {
                return;
            }
            $buyN = (int) $this->input('buy_n', 0);
            $payM = (int) $this->input('pay_m', 0);
            if ($buyN > 0 && $payM >= $buyN) {
                $v->errors()->add('pay_m', 'Lo que paga el cliente debe ser MENOR que lo que se lleva (ej. 2x1: lleva 2, paga 1).');
            }
        });
    }

    public function messages(): array
    {
        return [
            'buy_n.min'            => 'Una promo NxM necesita al menos 2 piezas (ej. 2x1).',
            'buy_n.prohibited'     => 'buy_n solo aplica a promos NxM.',
            'pay_m.prohibited'     => 'pay_m solo aplica a promos NxM.',
            'tiers.required'       => 'Agrega al menos un escalón (ej. 2 piezas → $100 de descuento).',
            'tiers.prohibited'     => 'Los escalones solo aplican a promos de descuento por cantidad.',
            'tiers.*.qty.min'      => 'Cada escalón necesita al menos 2 piezas.',
            'tiers.*.qty.distinct' => 'Hay dos escalones con la misma cantidad de piezas.',
            'tiers.*.amount.gt'    => 'El descuento de cada escalón debe ser mayor a $0.',
        ];
    }
}
