<?php

namespace App\Http\Requests;

use App\Models\PreSale;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Rule;

class UpdatePreSaleStatusRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'status' => ['required', Rule::in([
                PreSale::STATUS_LIVE,
                PreSale::STATUS_READY,
                PreSale::STATUS_COMPLETED,
                PreSale::STATUS_CANCELLED,
            ])],
            'notes'  => ['nullable', 'string', 'max:500'],
        ];
    }
}
