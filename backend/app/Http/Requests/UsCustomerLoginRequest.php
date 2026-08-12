<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * TadaimaUS — login del cliente de la tienda (POST /us/auth/login).
 * `identifier` acepta email O teléfono; la bifurcación vive en el controller.
 * Mensajes en INGLÉS (comprador final US).
 */
class UsCustomerLoginRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'identifier' => ['required', 'string', 'max:190'],
            'password'   => ['required', 'string', 'max:190'],
        ];
    }

    public function messages(): array
    {
        return [
            'identifier.required' => 'Please enter your email or phone.',
            'password.required'   => 'Please enter your password.',
        ];
    }
}
