<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreUserRequest;
use App\Http\Requests\UpdateUserRequest;
use App\Http\Resources\UserResource;
use App\Models\Store;
use App\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class UserController extends Controller
{
    /**
     * GET /users/online
     *
     * Lista los usuarios "conectados" (last_seen_at < 2 min). Admin sin store_id
     * ve todos; admin con store_id filtra a esa sucursal; gerente/cajero se
     * limitan a su propia tienda. Útil para que admin vea cajeros logueados
     * antes de que abran caja registradora.
     */
    public function online(Request $request): JsonResponse
    {
        $authUser = $request->user();
        $isAdminUser = $authUser && $authUser->hasRole(['admin', 'super_admin', 'owner', 'dueño']);

        $threshold = now()->subMinutes(2);

        $query = User::query()
            // Nota: `roles` es un accessor (getRolesAttribute), NO una relación
            // Eloquent — no se puede eager-load con `with('roles')` o lanza
            // RelationNotFoundException. Solo cargamos la relación real `store`.
            ->with(['store:id,name'])
            ->where('active', true)
            ->where('last_seen_at', '>=', $threshold);

        if (! $isAdminUser) {
            $storeId = $authUser?->store_id;
            if (! $storeId) {
                return $this->success([]);
            }
            $query->where('store_id', $storeId);
        } elseif ($request->filled('store_id')) {
            $query->where('store_id', $request->integer('store_id'));
        }

        $users = $query->orderByDesc('last_seen_at')->get();

        return $this->success(
            $users->map(fn ($u) => [
                'id'           => $u->id,
                'name'         => $u->name,
                'avatar_url'   => $u->avatar_url
                    ? (str_starts_with($u->avatar_url, 'http') ? $u->avatar_url : \Storage::url($u->avatar_url))
                    : null,
                'store_id'     => $u->store_id,
                'store_name'   => $u->store?->name,
                'last_seen_at' => $u->last_seen_at?->toISOString(),
                'roles'        => $u->roles,
            ])->values()
        );
    }

    /**
     * GET /users
     * Filters: store_id, company_id, active, search (name/email)
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $isAdmin = $user && $user->isAdminRole();
        $users = User::query()
            ->with('store')
            // Scope cross-tienda: no-admin solo ve usuarios de SU tienda (evita
            // exponer PII de empleados de otras sucursales).
            ->when($isAdmin && $request->filled('store_id'),   fn ($q) => $q->where('store_id',   $request->store_id))
            ->when($isAdmin && $request->filled('company_id'), fn ($q) => $q->where('company_id', $request->company_id))
            ->when(! $isAdmin, function ($q) use ($user) {
                $user->store_id ? $q->where('store_id', $user->store_id) : $q->whereRaw('1=0');
            })
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
        // Gate de creación (anti-escalada): admin crea libremente. Un gerente
        // puede crear usuarios de SU tienda pero NUNCA un admin. Cualquier otro
        // (cajero, etc.) no crea usuarios. Antes este endpoint no tenía guard →
        // cualquier token podía crear/promover a admin por API directa.
        $authUser = $request->user();
        if (! $authUser->isAdminRole()) {
            if (! $authUser->hasRole(['gerente', 'manager'])) {
                return $this->error('No autorizado para crear usuarios.', 403);
            }
            if (! $authUser->canActOnStore($request->integer('store_id'))) {
                return $this->error('Solo puedes crear usuarios de tu tienda.', 403);
            }
            if ($this->roleIsAdmin($request->role_id)) {
                return $this->error('No puedes asignar el rol de administrador.', 403);
            }
        }

        $user = DB::transaction(function () use ($request) {
            $data = $request->only([
                'name', 'email', 'password', 'phone', 'address',
                'company_id', 'store_id', 'active', 'can_view_cost', 'can_edit_catalog', 'can_manage_promos',
            ]);

            // La UI no manda company_id → derivarlo del admin que crea, o de la
            // tienda asignada. Sin esto el usuario nace con company NULL y no
            // puede crear tiendas/bodegas ni ver los settings de la empresa
            // (bug QA 2026-06-10).
            $data['company_id'] ??= $request->user()?->company_id
                ?? ($request->filled('store_id') ? Store::find($request->store_id)?->company_id : null);

            // can_view_cost NO se auto-enciende para gerentes (feedback cliente
            // 2026-06-24): nadie ve costos hasta que el admin lo active
            // explícitamente desde Permisos de Precios. Queda en el default de
            // la columna (false) salvo que se mande explícito en el request.

            // can_manage_promos por ROL (pedido Joel 2026-07-18): gerente nace
            // ON (default del negocio), cajero nace OFF — sin esto el default
            // de la columna (true) dejaba a los cajeros "con permiso" en la UI
            // de Permisos aunque el rol ya los bloqueara.
            if (! $request->has('can_manage_promos')) {
                $data['can_manage_promos'] = $this->roleGrantsPromos($request->input('role_id'));
            }

            // Copia encriptada del password para que el admin pueda consultarlo
            // en users settings (el cast 'encrypted' del modelo lo cifra con la
            // APP_KEY). El login sigue usando el bcrypt de `password`.
            if ($request->filled('password')) {
                $data['password_enc'] = $request->password;
            }

            $user = User::create($data);

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
        // RBAC: solo un admin edita a OTROS usuarios. Un no-admin solo puede
        // tocar su propia cuenta (y sin auto-asignarse tienda/costo/estado).
        // Antes este endpoint no tenía guard → cualquier token podía cambiar
        // la contraseña de cualquier usuario (toma de cuenta).
        $authUser = $request->user();
        $isAdmin  = $authUser->isAdminRole();
        $isSelf   = (int) $authUser->id === (int) $user->id;
        // "Gerente" = rol real (no el flag can_view_cost, que un cajero podría
        // tener) + misma tienda + el target NO es admin (no se toca a un admin).
        $isManager = $authUser->hasRole(['gerente', 'manager']) && (int) $authUser->store_id === (int) $user->store_id && ! $user->isAdminRole();

        if (! $isAdmin && ! $isSelf && ! $isManager) {
            return $this->error('No autorizado para modificar este usuario.', 403);
        }

        $fields = $isAdmin
            ? ['name', 'email', 'phone', 'address', 'company_id', 'store_id', 'active', 'can_view_cost', 'can_edit_catalog', 'can_manage_promos']
            : ['name', 'email', 'phone', 'address'];

        $data = $request->only($fields);

        // El password por esta vía es reset admin-only. El cambio self-service
        // va por POST /auth/password (verifica la contraseña actual).
        if ($isAdmin && $request->filled('password')) {
            $data['password']     = $request->password; // cast 'hashed' lo encripta
            $data['password_enc'] = $request->password; // copia reversible (cast 'encrypted') para que el admin la vea
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
        $authUser = request()->user();
        $isAdmin  = $authUser?->hasRole(['admin', 'super_admin', 'owner', 'dueño']);
        $isSelf   = (int) $authUser?->id === (int) $user->id;
        $isManager = $authUser?->hasRole(['gerente', 'manager']) && (int) $authUser?->store_id === (int) $user->store_id && ! $user->isAdminRole();

        if (! $isAdmin && ! $isManager) {
            return $this->error('No autorizado para desactivar este usuario.', 403);
        }

        // Proteger: no desactivar al propio usuario (incluso si es admin)
        if ($isSelf) {
            return $this->error('No puedes desactivar tu propio usuario.', 422);
        }

        $user->update(['active' => false]);

        return $this->success(null, 'Usuario desactivado.');
    }

    /** ¿El rol (por id) es de administrador? Bloquea que un no-admin escale roles. */
    private function roleIsAdmin(int|string|null $roleId): bool
    {
        if (! $roleId) {
            return false;
        }
        $name = DB::table('roles')->where('id', $roleId)->value('name');

        return $name !== null && in_array($name, User::ADMIN_ROLES, true);
    }

    /** ¿El rol concede gestión de promos por default? (gerente/manager o admin). */
    private function roleGrantsPromos(int|string|null $roleId): bool
    {
        if (! $roleId) {
            return false;
        }
        $name = DB::table('roles')->where('id', $roleId)->value('name');

        return $name !== null
            && (in_array($name, ['gerente', 'manager'], true) || in_array($name, User::ADMIN_ROLES, true));
    }

    /**
     * POST /users/{user}/roles
     * Body: { role_id: int }
     *
     * Sincroniza el rol: borra los roles previos del usuario y asigna el nuevo.
     * El form de admin sólo permite un rol a la vez, así que reemplazar (no
     * acumular) es lo correcto — antes el INSERT idempotente dejaba al usuario
     * con el rol viejo + el nuevo al cambiarlo (p. ej. admin + cajero).
     */
    public function assignRole(Request $request, User $user): JsonResponse
    {
        $request->validate(['role_id' => ['required', 'integer', 'exists:roles,id']]);

        // Gate (anti-escalada): admin asigna cualquier rol. Un gerente solo
        // cambia el rol de usuarios NO-admin de SU tienda, y NUNCA a admin.
        $authUser = $request->user();
        if (! $authUser->isAdminRole()) {
            $canManage = $authUser->hasRole(['gerente', 'manager'])
                && $authUser->canActOnStore($user->store_id)
                && ! $user->isAdminRole();
            if (! $canManage || $this->roleIsAdmin($request->role_id)) {
                return $this->error('No autorizado para asignar este rol.', 403);
            }
        }

        // Antes de sincronizar: ¿el rol ACTUAL ya concedía promos? Solo se toca
        // el flag cuando cambia la categoría (cajero↔gerente) — así una
        // revocación explícita del admin sobrevive a re-asignar el mismo rol.
        $grantedBefore = $user->isAdminRole() || $user->hasRole(['gerente', 'manager']);

        DB::transaction(function () use ($request, $user) {
            DB::table('model_has_roles')
                ->where('model_type', User::class)
                ->where('model_id',   $user->id)
                ->delete();

            DB::table('model_has_roles')->insert([
                'role_id'    => $request->role_id,
                'model_type' => User::class,
                'model_id'   => $user->id,
            ]);
        });

        // can_view_cost NO se auto-enciende al volverse gerente (feedback
        // cliente 2026-06-24): el admin lo activa explícitamente en Permisos.

        // can_manage_promos SÍ se sincroniza por rol (pedido Joel 2026-07-18):
        // promover a gerente lo enciende (default del negocio) y degradar a
        // cajero lo apaga. Mismo rol re-asignado = sin cambios.
        $grantsNow = $this->roleGrantsPromos($request->role_id);
        if ($grantedBefore !== $grantsNow) {
            $user->update(['can_manage_promos' => $grantsNow]);
        }

        return $this->success(['roles' => $user->fresh()->roles], 'Rol asignado.');
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
        $isSelf   = (int) $authUser?->id === (int) $user->id;
        $isManager = $authUser?->hasRole(['gerente', 'manager']) && (int) $authUser?->store_id === (int) $user->store_id && ! $user->isAdminRole();

        if (! $isAdmin && ! $isSelf && ! $isManager) {
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
        $isSelf   = (int) $authUser?->id === (int) $user->id;
        $isManager = $authUser?->hasRole(['gerente', 'manager']) && (int) $authUser?->store_id === (int) $user->store_id && ! $user->isAdminRole();

        if (! $isAdmin && ! $isSelf && ! $isManager) {
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
        $isSelf   = (int) $authUser?->id === (int) $user->id;
        $isManager = $authUser?->hasRole(['gerente', 'manager']) && (int) $authUser?->store_id === (int) $user->store_id && ! $user->isAdminRole();

        if (! $isAdmin && ! $isSelf && ! $isManager) {
            return $this->error('Sin permisos para cambiar el avatar de otro usuario.', 403);
        }

        if ($user->avatar_url && ! str_starts_with($user->avatar_url, 'http')) {
            try { \Storage::delete($user->avatar_url); } catch (\Throwable) { /* ignore */ }
        }
        $user->update(['avatar_url' => null]);

        return $this->success(new UserResource($user->fresh('store')), 'Avatar eliminado.');
    }
}
