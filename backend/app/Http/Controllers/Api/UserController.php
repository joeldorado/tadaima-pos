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
}
