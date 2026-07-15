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
        return [
            'name'      => ['required', 'string', 'max:100'],
            'buy_n'     => ['required', 'integer', 'min:2', 'max:100'],
            'pay_m'     => ['required', 'integer', 'min:1'],
            'starts_at' => ['nullable', 'date'],
            'ends_at'   => ['nullable', 'date', 'after_or_equal:starts_at'],
            'status'    => ['nullable', Rule::in(ProductPromotion::STATUSES)],
            'priority'  => ['nullable', 'integer', 'min:0', 'max:999'],
        ];
    }

    /** pay_m < buy_n — "compra 2 paga 2" no es promo y rompería el motor. */
    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $v): void {
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
            'buy_n.min' => 'Una promo NxM necesita al menos 2 piezas (ej. 2x1).',
        ];
    }
}
