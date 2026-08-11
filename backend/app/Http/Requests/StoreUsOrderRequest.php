<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * TadaimaUS — validación del checkout dummy público (POST /us/orders).
 *
 * Contrato: { name, email, phone, items: [{ listing_id, quantity }] }.
 * Items 1..50, quantity 1..99. La visibilidad del listing se valida en
 * UsOrderService (dentro de la transacción, con lock).
 *
 * Mensajes en INGLÉS: el consumidor es el cliente final de la tienda US.
 * El envelope 422 { success:false, error, errors } lo pone bootstrap/app.php.
 */
class StoreUsOrderRequest extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    public function rules(): array
    {
        return [
            'name'  => ['required', 'string', 'max:120'],
            'email' => ['required', 'email', 'max:190'],
            'phone' => ['required', 'string', 'min:7', 'max:30'],

            // Honeypot: campo oculto en el form; un humano nunca lo llena.
            // max:0 = cualquier contenido lo tira con 422 (mensaje neutro).
            'website' => ['nullable', 'string', 'max:0'],

            'items'              => ['required', 'array', 'min:1', 'max:50'],
            'items.*.listing_id' => ['required', 'integer'],
            'items.*.quantity'   => ['required', 'integer', 'min:1', 'max:99'],
        ];
    }

    public function messages(): array
    {
        return [
            'name.required'              => 'Please enter your name.',
            'name.max'                   => 'Name is too long.',
            'email.required'             => 'Please enter your email address.',
            'email.email'                => 'Please enter a valid email address.',
            'phone.required'             => 'Please enter your phone number.',
            'phone.min'                  => 'Please enter a valid phone number.',
            'phone.max'                  => 'Please enter a valid phone number.',
            'items.required'             => 'Your cart is empty.',
            'items.min'                  => 'Your cart is empty.',
            'items.max'                  => 'Too many items in a single order.',
            'items.*.listing_id.required' => 'Invalid cart item.',
            'items.*.listing_id.integer'  => 'Invalid cart item.',
            'items.*.quantity.required'  => 'Invalid item quantity.',
            'items.*.quantity.integer'   => 'Invalid item quantity.',
            'items.*.quantity.min'       => 'Invalid item quantity.',
            'items.*.quantity.max'       => 'Quantity is limited to 99 per item.',
            'website.max'                => 'Unable to process this order.',
        ];
    }
}
