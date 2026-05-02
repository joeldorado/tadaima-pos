<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class OpenCashSessionRequest extends FormRequest
{
    public function authorize(): bool { return true; }

    public function rules(): array
    {
        return [
            'register_id'  => ['required', 'integer', 'exists:cash_registers,id'],
            'opening_cash' => ['required', 'numeric', 'min:0'],
        ];
    }
}
