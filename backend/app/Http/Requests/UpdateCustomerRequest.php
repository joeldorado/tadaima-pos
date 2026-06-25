<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdateCustomerRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        $customerId = $this->route('customer');

        return [
            'name'               => ['sometimes', 'string', 'max:255'],
            'phone'              => ['nullable', 'string', 'max:20'],
            'email'              => ['nullable', 'email', 'max:255'],
            'address'            => ['nullable', 'string', 'max:500'],
            'notes'              => ['nullable', 'string'],
            'external_member_id' => [
                'nullable', 'string', 'max:100',
                Rule::unique('customers', 'external_member_id')->ignore($customerId),
            ],
            'loyalty_tier' => ['nullable', 'string', 'in:Bronce,Plata,Oro,Leyenda'],
            'tier'         => ['nullable', 'string', 'in:Bronce,Plata,Oro,Leyenda'],
            'points'       => ['nullable', 'integer', 'min:0'],
            // Snapshot del socio Tadaima (ver StoreCustomerRequest).
            'member_status'     => ['nullable', 'string', 'in:ACTIVO,INACTIVO'],
            'member_level'      => ['nullable', 'string', 'max:20'],
            'member_expires_at' => ['nullable', 'date'],
            'member_debt'       => ['nullable', 'numeric'],
        ];
    }

    protected function prepareForValidation(): void
    {
        if ($this->has('tier') && ! $this->has('loyalty_tier')) {
            $this->merge(['loyalty_tier' => $this->tier]);
        }
    }
}
