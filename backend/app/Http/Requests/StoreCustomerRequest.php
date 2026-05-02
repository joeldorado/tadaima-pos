<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

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
            'phone'              => ['nullable', 'string', 'max:20', 'unique:customers,phone'],
            'email'              => ['nullable', 'email', 'max:255'],
            'address'            => ['nullable', 'string', 'max:500'],
            'notes'              => ['nullable', 'string'],
            'external_member_id' => ['nullable', 'string', 'max:100', 'unique:customers,external_member_id'],
            'loyalty_tier'       => ['nullable', 'string', 'in:Bronce,Plata,Oro,Leyenda'],
            'tier'               => ['nullable', 'string', 'in:Bronce,Plata,Oro,Leyenda'], // alias
            'points'             => ['nullable', 'integer', 'min:0'],
        ];
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
