<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreUserRequest;
use App\Http\Requests\UpdateUserRequest;
use App\Http\Resources\UserResource;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class UserController extends Controller
{
    /**
     * GET /users
     * Filters: store_id, company_id, active, search (name/email)
     */
    public function index(Request $request): JsonResponse
    {
        $users = User::query()
            ->with('store')
            ->when($request->filled('store_id'),   fn ($q) => $q->where('store_id',   $request->store_id))
            ->when($request->filled('company_id'), fn ($q) => $q->where('company_id', $request->company_id))
            ->when($request->filled('active'),     fn ($q) => $q->where('active',     (bool) $request->active))
            ->when($request->filled('search'), fn ($q) => $q->where(function ($q) use ($request) {
                $q->where('name',  'like', "%{$request->search}%")
                  ->orWhere('email', 'like', "%{$request->search}%");
            }))
            ->orderBy('name')
            ->get();

        return $this->success(UserResource::collection($users));
    }

    /**
     * POST /users
     * Crea un usuario. Si se envía role_id, asigna el rol al crearlo.
     */
    public function store(StoreUserRequest $request): JsonResponse
    {
        $user = DB::transaction(function () use ($request) {
            $user = User::create($request->only([
                'name', 'email', 'password', 'phone', 'address',
                'company_id', 'store_id', 'active', 'can_view_cost',
            ]));

            if ($request->filled('role_id')) {
                DB::table('model_has_roles')->insert([
                    'role_id'    => $request->role_id,
                    'model_type' => User::class,
                    'model_id'   => $user->id,
                ]);
            }

            return $user->load('store');
        });

        return $this->success(new UserResource($user), 'Usuario creado.', 201);
    }

    /**
     * GET /users/{user}
     */
    public function show(User $user): JsonResponse
    {
        $user->load('store');

        return $this->success(new UserResource($user));
    }

    /**
     * PUT /users/{user}
     * Actualiza datos. Si se envía password null o vacío, no se modifica.
     */
    public function update(UpdateUserRequest $request, User $user): JsonResponse
    {
        $data = $request->only([
            'name', 'email', 'phone', 'address',
            'company_id', 'store_id', 'active', 'can_view_cost',
        ]);

        if ($request->filled('password')) {
            $data['password'] = $request->password; // cast 'hashed' lo encripta
        }

        $user->update($data);

        return $this->success(new UserResource($user->fresh('store')), 'Usuario actualizado.');
    }

    /**
     * DELETE /users/{user}
     * Soft-delete: desactiva en lugar de borrar.
     */
    public function destroy(User $user): JsonResponse
    {
        // Proteger: no desactivar al propio usuario
        if ($user->id === request()->user()->id) {
            return $this->error('No puedes desactivar tu propio usuario.', 422);
        }

        $user->update(['active' => false]);

        return $this->success(null, 'Usuario desactivado.');
    }

    /**
     * POST /users/{user}/roles
     * Body: { role_id: int }
     */
    public function assignRole(Request $request, User $user): JsonResponse
    {
        $request->validate(['role_id' => ['required', 'integer', 'exists:roles,id']]);

        $exists = DB::table('model_has_roles')
            ->where('role_id',    $request->role_id)
            ->where('model_type', User::class)
            ->where('model_id',   $user->id)
            ->exists();

        if (! $exists) {
            DB::table('model_has_roles')->insert([
                'role_id'    => $request->role_id,
                'model_type' => User::class,
                'model_id'   => $user->id,
            ]);
        }

        return $this->success(['roles' => $user->roles], 'Rol asignado.');
    }

    /**
     * DELETE /users/{user}/roles/{roleId}
     */
    public function removeRole(User $user, int $roleId): JsonResponse
    {
        DB::table('model_has_roles')
            ->where('role_id',    $roleId)
            ->where('model_type', User::class)
            ->where('model_id',   $user->id)
            ->delete();

        return $this->success(['roles' => $user->roles], 'Rol removido.');
    }

    /**
     * POST /users/{user}/avatar
     *
     * Sube una foto de perfil personalizada al bucket. Reemplaza la avatar
     * existente (sea upload anterior o URL externa). Validación estricta:
     * solo image/{jpeg,png,webp}, max 3 MB.
     *
     * Permisos: admin puede editar a cualquiera; cada usuario puede editar
     * su propia foto (auth->id === user->id).
     */
    public function uploadAvatar(Request $request, User $user): JsonResponse
    {
        $authUser = $request->user();
        $isAdmin  = $authUser?->hasRole(['admin', 'super_admin', 'owner', 'dueño']);
        if (! $isAdmin && (int) $authUser?->id !== (int) $user->id) {
            return $this->error('Sin permisos para cambiar el avatar de otro usuario.', 403);
        }

        $request->validate([
            'image' => ['required', 'file', 'image', 'mimes:jpeg,jpg,png,webp', 'max:3072'],
        ]);

        // Si la avatar previa era un path GCS (no http), borrarla del bucket
        // antes de subir la nueva. Las URLs externas (PokéAPI/DiceBear) no
        // viven en nuestro bucket, no hay que borrar nada.
        if ($user->avatar_url && ! str_starts_with($user->avatar_url, 'http')) {
            try { \Storage::delete($user->avatar_url); } catch (\Throwable) { /* ignore */ }
        }

        try {
            $path = $request->file('image')->store('profile_pics');
        } catch (\Throwable $e) {
            \Log::error('Avatar upload failed', ['error' => $e->getMessage()]);
            return $this->error('Error al subir la foto.', 500);
        }

        if ($path === false) {
            return $this->error('No se pudo guardar la foto.', 500);
        }

        $user->update(['avatar_url' => $path]);

        return $this->success(new UserResource($user->fresh('store')), 'Avatar actualizado.');
    }

    /**
     * PUT /users/{user}/avatar/external
     *
     * Guarda una URL externa como avatar (galería Pokemon/DiceBear). Body: { url }.
     * Whitelist estricto de dominios — si un cajero comprometido manda URL de
     * tracker, se rechaza.
     */
    public function setExternalAvatar(Request $request, User $user): JsonResponse
    {
        $authUser = $request->user();
        $isAdmin  = $authUser?->hasRole(['admin', 'super_admin', 'owner', 'dueño']);
        if (! $isAdmin && (int) $authUser?->id !== (int) $user->id) {
            return $this->error('Sin permisos para cambiar el avatar de otro usuario.', 403);
        }

        $request->validate([
            'url' => ['required', 'string', 'max:500', 'url'],
        ]);

        // Whitelist explícito. Cualquier otra fuente se rechaza para impedir
        // que un usuario malicioso meta tracking pixels o phishing en su perfil.
        // Joel 2026-05-21: DiceBear removido — la galería en UI sólo ofrece
        // Pokémon (GitHub repo oficial). Plan futuro: pre-descargar sprites al
        // bucket para eliminar también esta dependencia externa.
        $url = $request->input('url');
        $allowedPrefixes = [
            'https://raw.githubusercontent.com/PokeAPI/sprites/',
        ];
        $allowed = false;
        foreach ($allowedPrefixes as $prefix) {
            if (str_starts_with($url, $prefix)) {
                $allowed = true;
                break;
            }
        }
        if (! $allowed) {
            return $this->error('Esa URL no está en la lista de fuentes permitidas.', 422);
        }

        // Si la previa era upload del bucket, limpiarla
        if ($user->avatar_url && ! str_starts_with($user->avatar_url, 'http')) {
            try { \Storage::delete($user->avatar_url); } catch (\Throwable) { /* ignore */ }
        }

        $user->update(['avatar_url' => $url]);

        return $this->success(new UserResource($user->fresh('store')), 'Avatar actualizado.');
    }

    /**
     * DELETE /users/{user}/avatar
     * Quita la foto de perfil (vuelve a iniciales). Borra del bucket si era upload.
     */
    public function removeAvatar(Request $request, User $user): JsonResponse
    {
        $authUser = $request->user();
        $isAdmin  = $authUser?->hasRole(['admin', 'super_admin', 'owner', 'dueño']);
        if (! $isAdmin && (int) $authUser?->id !== (int) $user->id) {
            return $this->error('Sin permisos para cambiar el avatar de otro usuario.', 403);
        }

        if ($user->avatar_url && ! str_starts_with($user->avatar_url, 'http')) {
            try { \Storage::delete($user->avatar_url); } catch (\Throwable) { /* ignore */ }
        }
        $user->update(['avatar_url' => null]);

        return $this->success(new UserResource($user->fresh('store')), 'Avatar eliminado.');
    }
}
