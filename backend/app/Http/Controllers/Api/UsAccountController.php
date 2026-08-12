<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\UpdateUsPasswordRequest;
use App\Http\Requests\UpdateUsProfileRequest;
use App\Models\UsCustomer;
use App\Models\UsOrder;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;

/**
 * TadaimaUS — panel del CLIENTE ("My Orders" + Settings de la tienda).
 *
 * Todas las rutas van con `auth:us`: request()->user() SIEMPRE es un
 * UsCustomer (un token del POS ni siquiera llega — guard con provider
 * us_customers). El scoping de pedidos es por relación: imposible ver ajenos.
 * Mensajes en INGLÉS.
 */
class UsAccountController extends Controller
{
    /** Cap de "My Orders" (más nuevos primero; sin paginación en v1). */
    private const MAX_ORDERS = 100;

    /** GET /us/account/me — perfil + dirección default. */
    public function me(Request $request): JsonResponse
    {
        /** @var UsCustomer $customer */
        $customer = $request->user();

        return $this->success($customer->toProfileArray());
    }

    /** GET /us/account/orders — SOLO los pedidos del cliente autenticado. */
    public function orders(Request $request): JsonResponse
    {
        /** @var UsCustomer $customer */
        $customer = $request->user();

        $orders = $customer->orders()
            ->with('items')
            ->limit(self::MAX_ORDERS)
            ->get();

        return $this->success($orders->map(fn (UsOrder $o) => [
            'id'           => $o->id,
            'order_number' => $o->order_number,
            'status'       => $o->status,
            'total_usd'    => number_format((float) $o->total_usd, 2, '.', ''),
            'created_at'   => $o->created_at?->toISOString(),
            'shipping'     => [
                'address' => $o->shipping_address,
                'city'    => $o->shipping_city,
                'state'   => $o->shipping_state,
                'zip'     => $o->shipping_zip,
                'country' => $o->shipping_country,
            ],
            'items'        => $o->items->map(fn ($i) => [
                'id'             => $i->id,
                'name'           => $i->name,
                'price_usd'      => number_format((float) $i->price_usd, 2, '.', ''),
                'quantity'       => $i->quantity,
                'line_total_usd' => number_format((float) $i->line_total_usd, 2, '.', ''),
            ])->values(),
        ])->values());
    }

    /**
     * PUT /us/account/profile — nombre/teléfono/dirección default.
     * El email NO se edita (v1): es la llave de la cuenta.
     */
    public function updateProfile(UpdateUsProfileRequest $request): JsonResponse
    {
        /** @var UsCustomer $customer */
        $customer = $request->user();
        $data = $request->validated();

        $customer->update([
            'name'    => $data['name'],
            'phone'   => UsCustomer::normalizePhone($data['phone']),
            'address' => $data['address'],
            'city'    => $data['city'],
            'state'   => $data['state'],
            'zip'     => $data['zip'],
            'country' => $data['country'],
        ]);

        return $this->success($customer->toProfileArray(), 'Profile updated.');
    }

    /**
     * PUT /us/account/password — exige la contraseña actual; al cambiarla
     * revoca los DEMÁS tokens (otras sesiones/dispositivos salen).
     */
    public function changePassword(UpdateUsPasswordRequest $request): JsonResponse
    {
        /** @var UsCustomer $customer */
        $customer = $request->user();
        $data = $request->validated();

        if (! Hash::check($data['current_password'], $customer->password)) {
            return $this->error('Current password is incorrect.', 422, [
                'current_password' => ['Current password is incorrect.'],
            ]);
        }

        $customer->update(['password' => $data['password']]); // cast hashed

        $customer->tokens()
            ->where('id', '!=', $customer->currentAccessToken()->id)
            ->delete();

        return $this->success(null, 'Password updated.');
    }
}
