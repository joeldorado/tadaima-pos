<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

class UpdateLayawayRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'notes'      => ['nullable', 'string', 'max:1000'],
            'expires_at' => ['nullable', 'date'],
        ];
    }
}
