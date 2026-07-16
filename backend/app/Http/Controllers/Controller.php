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
     * Gate admin-only: 403 si el usuario NO es administrador. Para configuración
     * sensible (tiendas/bodegas/terminales) que no es trabajo de gerente/cajero.
     */
    protected function adminOnlyError(): ?JsonResponse
    {
        $user = request()->user();
        if ($user && ! $user->isAdminRole()) {
            return $this->error('Solo un administrador puede modificar esta configuración.', 403);
        }

        return null;
    }

    /**
     * Gate de edición de la tienda online: 403 si el usuario NO es admin ni
     * tiene el flag can_edit_catalog. Flag-based (no role-based), espejo de
     * can_view_cost — un gerente sin el flag no edita el catálogo. Usa el
     * request global para no atar la firma de los métodos que no lo reciben.
     */
    protected function catalogEditError(): ?JsonResponse
    {
        $user = request()->user();
        if ($user && ! $user->canEditCatalog()) {
            return $this->error('No tienes permiso para editar el catálogo online.', 403);
        }

        return null;
    }

    /**
     * Gate de gestión de promociones: 403 si el usuario NO es admin y le
     * REVOCARON el flag can_manage_promos (nace en true — pedido Joel
     * 2026-07-18). Se usa DESPUÉS de adminOrManagerGateError: el rol sigue
     * siendo requisito, este flag solo quita el permiso a un gerente puntual.
     */
    protected function promoManageError(): ?JsonResponse
    {
        $user = request()->user();
        if ($user && ! $user->canManagePromos()) {
            return $this->error('No tienes permiso para gestionar promociones — pídele al admin que te lo active en Permisos.', 403);
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
