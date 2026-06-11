<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;

abstract class Controller
{
    protected function success(mixed $data, string $message = null, int $status = 200): JsonResponse
    {
        $payload = ['success' => true, 'data' => $data];
        if ($message !== null) {
            $payload['message'] = $message;
        }

        return response()->json($payload, $status);
    }

    protected function error(string $message, int $status = 400, array $errors = []): JsonResponse
    {
        $payload = ['success' => false, 'error' => $message];
        if ($errors) {
            $payload['errors'] = $errors;
        }

        return response()->json($payload, $status);
    }

    /**
     * Gate de mutación de catálogo: 403 si el usuario NO es admin ni gerente.
     * Cajero puede CREAR productos (alta rápida en caja) pero no editar/borrar.
     */
    protected function adminOrManagerGateError(): ?JsonResponse
    {
        $user = request()->user();
        if ($user && ! $user->isAdminRole() && ! $user->hasRole(['gerente', 'manager'])) {
            return $this->error('No tienes permiso para modificar el catálogo de productos.', 403);
        }

        return null;
    }

    /**
     * Guard de scope de tienda: devuelve la respuesta 403 si el usuario
     * autenticado NO puede operar sobre la tienda dada, o null si puede.
     * Uso: if ($resp = $this->storeScopeError($request, $storeId)) return $resp;
     */
    protected function storeScopeError(\Illuminate\Http\Request $request, int|string|null $storeId): ?JsonResponse
    {
        $user = $request->user();
        if ($user && ! $user->canActOnStore($storeId)) {
            return $this->error('No tienes permiso para operar sobre datos de otra tienda.', 403);
        }

        return null;
    }
}
