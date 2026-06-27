<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateCatalogSettingsRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    /**
     * Normaliza strings vacíos a null ANTES de validar: un `whatsapp_number` ""
     * (campo tocado y borrado en la UI) fallaría el regex `{8,20}` — `nullable`
     * solo exime `null`, no "". Igual para `catalog_url`. Sin esto, guardar el
     * catálogo con el WhatsApp vacío reventaba con 422.
     */
    protected function prepareForValidation(): void
    {
        $data = [];
        foreach (['whatsapp_number', 'catalog_url'] as $key) {
            if ($this->has($key)) {
                $val = $this->input($key);
                $data[$key] = is_string($val) && trim($val) === '' ? null : $val;
            }
        }
        if ($data) {
            $this->merge($data);
        }
    }

    public function rules(): array
    {
        // Resolver el id de la tienda sea que el route param venga como modelo
        // (binding implícito) o como valor crudo. Con la versión anterior
        // (`?->id ?? route`) el id podía no resolverse y la regla unique no
        // excluía el propio registro → re-guardar con el mismo slug fallaba.
        $storeParam = $this->route('store');
        $storeId = is_object($storeParam) ? (int) $storeParam->getKey() : (int) $storeParam;

        return [
            'catalog_url' => [
                'sometimes', 'nullable', 'string', 'max:100', 'alpha_dash',
                Rule::unique('catalog_settings', 'catalog_url')->ignore($storeId, 'store_id'),
            ],
            'whatsapp_number' => ['sometimes', 'nullable', 'string', 'regex:/^[0-9+\s()-]{8,20}$/'],
            'show_price'        => ['sometimes', 'boolean'],
            'show_stock'        => ['sometimes', 'boolean'],
            'show_search'       => ['sometimes', 'boolean'],
            'show_categories'   => ['sometimes', 'boolean'],
            'show_description'  => ['sometimes', 'boolean'],
            'cart_enabled'      => ['sometimes', 'boolean'],
            'hide_out_of_stock' => ['sometimes', 'boolean'],
        ];
    }
}
