<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreRoleRequest;
use App\Http\Resources\RoleResource;
use App\Models\Permission;
use App\Models\Role;
use App\Support\ModelAudit;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class RoleController extends Controller
{
    /**
     * GET /roles
     */
    public function index(): JsonResponse
    {
        $roles = Role::with('permissions')->orderBy('name')->get();

        return $this->success(RoleResource::collection($roles));
    }

    /**
     * POST /roles
     * Body: { name, guard_name? }
     */
    public function store(StoreRoleRequest $request): JsonResponse
    {
        $role = Role::create([
            'name'       => $request->name,
            'guard_name' => $request->input('guard_name', 'api'),
        ]);
        ModelAudit::created($role, 'role.created', "Rol «{$role->name}» creado", 'role', ['name', 'guard_name'], $request->user()->id);

        return $this->success(new RoleResource($role->load('permissions')), 'Rol creado.', 201);
    }

    /**
     * PUT /roles/{role}
     */
    public function update(Request $request, Role $role): JsonResponse
    {
        $request->validate([
            'name' => ['sometimes', 'string', 'max:100', "unique:roles,name,{$role->id}"],
        ]);

        $before = ModelAudit::snapshot($role, ['name']);
        $role->update($request->only('name'));
        ModelAudit::updated($role, $before, 'role.updated', "Rol «{$role->name}» editado", 'role', ['name'], $request->user()->id);

        return $this->success(new RoleResource($role->load('permissions')), 'Rol actualizado.');
    }

    /**
     * GET /permissions
     */
    public function permissions(): JsonResponse
    {
        $permissions = Permission::orderBy('name')->get();

        return $this->success($permissions->map(fn ($p) => [
            'id'   => $p->id,
            'name' => $p->name,
        ]));
    }

    /**
     * POST /roles/{role}/permissions
     * Body: { permissions: [1, 2, 3] }  — reemplaza todos los permisos del rol
     */
    public function assignPermissions(Request $request, Role $role): JsonResponse
    {
        $request->validate([
            'permissions'   => ['required', 'array'],
            'permissions.*' => ['integer', 'exists:permissions,id'],
        ]);

        $before = $role->permissions()->pluck('name')->sort()->values()->all();
        $role->permissions()->sync($request->permissions);
        $after = $role->permissions()->get()->pluck('name')->sort()->values()->all();
        if ($before !== $after) {
            ModelAudit::event('role.permissions_updated', "Rol «{$role->name}»: permisos cambiados", 'role', $role->id, [
                'added' => array_values(array_diff($after, $before)), 'removed' => array_values(array_diff($before, $after)),
            ], $request->user()->id);
        }

        return $this->success(new RoleResource($role->load('permissions')), 'Permisos actualizados.');
    }
}
