<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\UsCustomerLoginRequest;
use App\Models\UsCustomer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

/**
 * TadaimaUS — sesión del CLIENTE de la tienda (guard `us`).
 *
 * No hay registro standalone: la cuenta se crea en el checkout
 * (POST /us/orders con password — UsOrderService). Aquí solo el login de
 * regreso (email O teléfono + contraseña) y el logout.
 * Mensajes en INGLÉS: el consumidor es el comprador final US.
 */
class UsCustomerAuthController extends Controller
{
    /**
     * POST /us/auth/login — PÚBLICO (throttle us-auth: 5/min por ip+identifier).
     * Body: { identifier: email|teléfono, password }.
     */
    public function login(UsCustomerLoginRequest $request): JsonResponse
    {
        $data = $request->validated();
        $identifier = trim($data['identifier']);

        // Con '@' es email (lowercase — se guardan así); si no, teléfono
        // normalizado a dígitos (así se guarda: "(619) 555-0100" ≡ "6195550100").
        if (str_contains($identifier, '@')) {
            $customer = UsCustomer::whereRaw('LOWER(email) = ?', [strtolower($identifier)])->first();
        } else {
            $digits = UsCustomer::normalizePhone($identifier);
            $customer = $digits !== '' ? UsCustomer::where('phone', $digits)->first() : null;
        }

        // Mensaje GENÉRICO a propósito — no filtra si la cuenta existe.
        if (! $customer || ! Hash::check($data['password'], $customer->password)) {
            return $this->error('Invalid credentials. Please check your email or phone and password.', 401);
        }

        return $this->success([
            'token'    => $customer->createToken('us-customer')->plainTextToken,
            'customer' => $customer->toProfileArray(),
        ], 'Signed in.');
    }

    /** POST /us/account/logout — revoca SOLO el token actual. */
    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()->delete();

        return $this->success(null, 'Signed out.');
    }
}
