<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\LoginRequest;
use App\Http\Resources\UserResource;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class AuthController extends Controller
{
    /**
     * POST /auth/login
     *
     * Body: { email, password }
     * Returns: { token, user: { id, name, email, store_id, store, roles } }
     */
    public function login(LoginRequest $request): JsonResponse
    {
        if (! Auth::attempt($request->only('email', 'password'))) {
            return $this->error('Credenciales incorrectas.', 401);
        }

        $user  = Auth::user();
        $token = $user->createToken('pos-token')->plainTextToken;

        $user->load('store');

        return $this->success([
            'token' => $token,
            'user'  => new UserResource($user),
        ], 'Sesión iniciada.');
    }

    /**
     * POST /auth/logout
     * Invalida el token actual.
     */
    public function logout(Request $request): JsonResponse
    {
        $request->user()->currentAccessToken()->delete();

        return $this->success(null, 'Sesión cerrada.');
    }

    /**
     * GET /auth/me
     * Retorna el usuario autenticado con su tienda y roles.
     */
    public function me(Request $request): JsonResponse
    {
        $user = $request->user()->load('store');

        return $this->success(new UserResource($user));
    }
}
