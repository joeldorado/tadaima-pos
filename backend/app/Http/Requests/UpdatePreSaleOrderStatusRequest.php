<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdatePreSaleOrderStatusRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'status'          => ['required', 'in:ready,delivered,expired,cancelled'],
            'pickup_deadline' => ['nullable', 'date'],
            'notes'           => ['nullable', 'string', 'max:1000'],
        ];
    }
}
