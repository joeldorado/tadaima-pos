<?php

namespace App\Http\Requests;

use Illuminate\Foundation\Http\FormRequest;

/**
 * TadaimaUS — validación del checkout público (POST /us/orders).
 *
 * Contrato: { name, email, phone, address, city, state, zip, country,
 *             password?, items: [{ listing_id, quantity }] }.
 * Items 1..50, quantity 1..99. La visibilidad/sold_out del listing se valida
 * en UsOrderService (dentro de la transacción, con lock).
 *
 * Cuentas (flujo Wix replicado): la cuenta del cliente se CREA aquí — si NO
 * hay sesión de cliente (bearer del guard `us`), `password` es OBLIGATORIA y
 * UsOrderService registra al cliente + la orden en la misma transacción. Con
 * sesión, la orden se liga a la cuenta y password se ignora.
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
        // Auth OPCIONAL: sin middleware en la ruta; user('us') resuelve el
        // bearer contra el guard de clientes (token POS o sin token → null).
        $isGuest = $this->user('us') === null;

        return [
            'name'  => ['required', 'string', 'max:120'],
            'email' => ['required', 'email', 'max:190'],
            'phone' => ['required', 'string', 'min:7', 'max:30'],

            // Dirección de entrega (snapshot en el pedido, estilo Wix).
            'address' => ['required', 'string', 'max:190'],
            'city'    => ['required', 'string', 'max:120'],
            'state'   => ['required', 'string', 'max:60'],
            'zip'     => ['required', 'string', 'max:20'],
            'country' => ['required', 'string', 'max:60'],

            // Crea la cuenta del cliente (obligatoria para comprar, decisión
            // Joel 2026-08-12). Logueado no la manda.
            'password' => $isGuest
                ? ['required', 'string', 'min:8', 'max:190']
                : ['nullable', 'string'],

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
            'address.required'           => 'Please enter your address.',
            'city.required'              => 'Please enter your city.',
            'state.required'             => 'Please enter your state.',
            'zip.required'               => 'Please enter your zip / postal code.',
            'country.required'           => 'Please enter your country.',
            'password.required'          => 'Create a password to track your orders.',
            'password.min'               => 'Password must be at least 8 characters.',
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
