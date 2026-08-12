<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * TadaimaUS — edición de perfil del cliente (PUT /us/account/profile).
 * Mismos campos/límites que el checkout (StoreUsOrderRequest) menos email:
 * el email es la llave de la cuenta y no se edita en v1.
 * Mensajes en INGLÉS.
 */
class UpdateUsProfileRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true; // la ruta ya exige auth:us
    }

    public function rules(): array
    {
        return [
            'name'    => ['required', 'string', 'max:120'],
            'phone'   => ['required', 'string', 'min:7', 'max:30'],
            'address' => ['required', 'string', 'max:190'],
            'city'    => ['required', 'string', 'max:120'],
            'state'   => ['required', 'string', 'max:60'],
            'zip'     => ['required', 'string', 'max:20'],
            'country' => ['required', 'string', 'max:60'],
        ];
    }

    public function messages(): array
    {
        return [
            'name.required'    => 'Please enter your name.',
            'phone.required'   => 'Please enter your phone number.',
            'phone.min'        => 'Please enter a valid phone number.',
            'phone.max'        => 'Please enter a valid phone number.',
            'address.required' => 'Please enter your address.',
            'city.required'    => 'Please enter your city.',
            'state.required'   => 'Please enter your state.',
            'zip.required'     => 'Please enter your zip / postal code.',
            'country.required' => 'Please enter your country.',
        ];
    }
}
