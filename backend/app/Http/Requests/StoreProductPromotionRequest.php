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
        $esMayoreo = $type === ProductPromotion::TYPE_QTY_DISCOUNT;
        $esEspecial = $type === ProductPromotion::TYPE_SPECIAL_PRICE;

        // En PUT los campos van 'sometimes': `toggleStatus` (pausar/reanudar)
        // reenvía la promo por este mismo FormRequest, y un bundle rezagado no
        // manda los campos nuevos. El only() del controller ignora las claves
        // ausentes, así que un PUT parcial preserva la fila.
        $presence = in_array($this->method(), ['PUT', 'PATCH'], true) ? 'sometimes' : 'required';

        return [
            'name'      => ['required', 'string', 'max:100'],
            'type'      => ['nullable', Rule::in(ProductPromotion::TYPES)],
            // NxM: buy_n/pay_m obligatorios. Mayoreo: prohibidos.
            'buy_n'     => $type === ProductPromotion::TYPE_NXM
                ? ['required', 'integer', 'min:2', 'max:100']
                : ['prohibited'],
            'pay_m'     => $type === ProductPromotion::TYPE_NXM
                ? ['required', 'integer', 'min:1']
                : ['prohibited'],
            // Mayoreo: "desde min_qty piezas, −discount_per_unit a CADA una".
            'min_qty'           => $esMayoreo
                ? [$presence, 'integer', 'min:2', 'max:1000']
                : ['prohibited'],
            'discount_per_unit' => $esMayoreo
                ? [$presence, 'numeric', 'gt:0', 'max:999999']
                : ['prohibited'],
            // Precio especial (2026-11-15): desde 1 pieza. 'fixed' = precio
            // final por pieza; 'percent' = % de descuento entero-o-decimal 1–99.
            'price_mode'    => $esEspecial
                ? [$presence, Rule::in(ProductPromotion::PRICE_MODES)]
                : ['prohibited'],
            'special_value' => $esEspecial
                ? array_merge(
                    [$presence, 'numeric'],
                    $this->input('price_mode') === ProductPromotion::PRICE_MODE_PERCENT
                        ? ['min:1', 'max:99']
                        : ['gt:0', 'max:999999'],
                )
                : ['prohibited'],
            // Restricción de método de pago de la PROMO (espejo del producto).
            // Sin presencia condicional: el default de la columna cubre la
            // ausencia, así un bundle rezagado que solo pausa no truena.
            // `boolean` NO es opcional: sin esa regla un "false" string llega a
            // Eloquent, (bool)"false" === true, y la restricción se guardaría
            // AL REVÉS en silencio.
            'allow_cash' => ['sometimes', 'boolean'],
            'allow_card' => ['sometimes', 'boolean'],
            // Legacy: los bundles viejos lo siguen mandando al pausar. Se acepta
            // y se IGNORA — no está en el only() del controller ni en $fillable.
            'tiers'     => ['nullable', 'array'],
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
            'buy_n.min'        => 'Una promo NxM necesita al menos 2 piezas (ej. 2x1).',
            'buy_n.prohibited' => 'buy_n solo aplica a promos NxM.',
            'pay_m.prohibited' => 'pay_m solo aplica a promos NxM.',

            // Si el campo falta en un ALTA, casi siempre es un bundle viejo que
            // todavía pinta el formulario de escalones. Decírselo directo.
            'min_qty.required'           => 'Falta "a partir de cuántas piezas". Si no ves ese campo, recarga la app (Ctrl+Shift+R): traes una versión vieja.',
            'min_qty.min'                => 'El mayoreo arranca desde 2 piezas en adelante.',
            'min_qty.prohibited'         => 'La cantidad mínima solo aplica a promos de mayoreo.',
            'discount_per_unit.required' => 'Falta el descuento por pieza. Si no ves ese campo, recarga la app (Ctrl+Shift+R): traes una versión vieja.',
            'discount_per_unit.gt'       => 'El descuento por pieza debe ser mayor a $0.',
            'discount_per_unit.prohibited' => 'El descuento por pieza solo aplica a promos de mayoreo.',

            'price_mode.required'    => 'Elige si el precio especial es un precio fijo ($) o un porcentaje (%). Si no ves esa opción, recarga la app (Ctrl+Shift+R).',
            'price_mode.in'          => 'El precio especial solo puede ser precio fijo ($) o porcentaje (%).',
            'price_mode.prohibited'  => 'El precio fijo o porcentaje solo aplica a promos de precio especial.',
            'special_value.required' => 'Falta el precio o el porcentaje del precio especial.',
            'special_value.numeric'  => 'El precio o porcentaje debe ser un número.',
            'special_value.gt'       => 'El precio especial debe ser mayor a $0.',
            'special_value.min'      => 'El porcentaje debe ser de 1% a 99%.',
            'special_value.max'      => 'El porcentaje debe ser de 1% a 99%.',
            'special_value.prohibited' => 'El precio o porcentaje solo aplica a promos de precio especial.',
        ];
    }
}
