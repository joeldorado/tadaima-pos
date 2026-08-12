<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * TadaimaUS — cambio de contraseña del cliente (PUT /us/account/password).
 * La verificación de current_password contra el hash vive en el controller
 * (mensaje 422 propio). Mensajes en INGLÉS.
 */
class UpdateUsPasswordRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // la ruta ya exige auth:us
    }

    public function rules(): array
    {
        return [
            'current_password' => ['required', 'string', 'max:190'],
            'password'         => ['required', 'string', 'min:8', 'max:190'],
        ];
    }

    public function messages(): array
    {
        return [
            'current_password.required' => 'Please enter your current password.',
            'password.required'         => 'Please enter your new password.',
            'password.min'              => 'Password must be at least 8 characters.',
        ];
    }
}
