<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class StoreCustomerRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name'               => ['required', 'string', 'max:255'],
            'phone'              => $this->phoneRules(),
            'email'              => ['nullable', 'email', 'max:255'],
            'address'            => ['nullable', 'string', 'max:500'],
            'notes'              => ['nullable', 'string'],
            // Sin `unique`: el upsert por socio en CustomerController::store
            // reutiliza la ficha existente en vez de rechazar la reimportación.
            'external_member_id' => ['nullable', 'string', 'max:100'],
            'loyalty_tier'       => ['nullable', 'string', 'in:Bronce,Plata,Oro,Leyenda'],
            'tier'               => ['nullable', 'string', 'in:Bronce,Plata,Oro,Leyenda'], // alias
            'points'             => ['nullable', 'integer', 'min:0'],
        ];
    }

    /**
     * Reglas de teléfono. Para clientes manuales el teléfono es único, pero solo
     * entre los que SÍ tienen teléfono: el `unique` plano de Laravel trata NULL
     * como valor y bloqueaba al 2º cliente sin teléfono. Para socios Tadaima
     * (external_member_id) la identidad es el socio, no el teléfono, así que no
     * validamos unicidad para no bloquear la importación desde Supabase.
     *
     * @return array<int, mixed>
     */
    protected function phoneRules(): array
    {
        $rules = ['nullable', 'string', 'max:20'];

        if (! $this->filled('external_member_id')) {
            $rules[] = Rule::unique('customers', 'phone')->whereNotNull('phone');
        }

        return $rules;
    }

    /**
     * Normaliza 'tier' → 'loyalty_tier' antes de validar.
     */
    protected function prepareForValidation(): void
    {
        if ($this->has('tier') && ! $this->has('loyalty_tier')) {
            $this->merge(['loyalty_tier' => $this->tier]);
        }
    }
}
