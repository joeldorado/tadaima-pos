<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\Validator;

/**
 * Cambio de contraseña self-service (cualquier usuario autenticado sobre SU
 * propia cuenta). Exige la contraseña actual para evitar que un token robado
 * baste para tomar la cuenta — el reset de contraseña de OTROS sigue siendo
 * admin-only vía PUT /users/{user}.
 */
class ChangePasswordRequest extends FormRequest
{
    public function authorize(): bool
    {
        return $this->user() !== null;
    }

    public function rules(): array
    {
        return [
            'current_password' => ['required', 'string'],
            'password'         => ['required', 'string', 'min:8', 'different:current_password'],
        ];
    }

    public function withValidator(Validator $validator): void
    {
        $validator->after(function (Validator $v) {
            $user = $this->user();
            if ($user && filled($this->current_password)
                && ! Hash::check($this->current_password, $user->password)) {
                $v->errors()->add('current_password', 'La contraseña actual no es correcta.');
            }
        });
    }

    public function messages(): array
    {
        return [
            'password.different' => 'La nueva contraseña debe ser distinta de la actual.',
            'password.min'       => 'La nueva contraseña debe tener al menos 8 caracteres.',
            'current_password.required' => 'Ingresa tu contraseña actual.',
            'password.required'  => 'Ingresa la nueva contraseña.',
        ];
    }
}
