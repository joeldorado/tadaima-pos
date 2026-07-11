<?php

namespace App\Models;

use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;
use Laravel\Sanctum\HasApiTokens;

class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable, HasApiTokens;

    protected $fillable = [
        'name', 'email', 'password', 'password_enc',
        'company_id', 'store_id', 'phone', 'address', 'active', 'can_view_cost',
        'can_edit_catalog', 'avatar_url', 'last_seen_at',
    ];

    // password_enc en $hidden: nunca se auto-serializa. Solo se expone descifrado
    // vía UserResource gateado a admin (feedback 2026-06-24).
    protected $hidden = ['password', 'password_enc', 'remember_token'];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password'          => 'hashed',
            'password_enc'      => 'encrypted',
            'active'            => 'boolean',
            'can_view_cost'     => 'boolean',
            'can_edit_catalog'  => 'boolean',
            'last_seen_at'      => 'datetime',
        ];
    }

    public function store(): BelongsTo
    {
        return $this->belongsTo(Store::class);
    }

    public function company(): BelongsTo
    {
        return $this->belongsTo(Company::class);
    }

    /**
     * Roles del usuario leídos desde model_has_roles + roles.
     * Se evita Spatie para no agregar dependencia extra por ahora.
     */
    public function getRolesAttribute(): array
    {
        return \DB::table('model_has_roles')
            ->join('roles', 'roles.id', '=', 'model_has_roles.role_id')
            ->where('model_has_roles.model_type', self::class)
            ->where('model_has_roles.model_id', $this->id)
            ->pluck('roles.name')
            ->toArray();
    }

    /** Comprueba si el usuario tiene uno de los roles dados. */
    public function hasRole(string|array $roles): bool
    {
        $roles = (array) $roles;
        return count(array_intersect($this->roles, $roles)) > 0;
    }

    /** Variantes de rol que cuentan como administrador en todo el sistema. */
    public const ADMIN_ROLES = ['admin', 'super_admin', 'owner', 'dueño'];

    public function isAdminRole(): bool
    {
        return $this->hasRole(self::ADMIN_ROLES);
    }

    /**
     * Gate central de visibilidad de costos: admin siempre; el resto vía el
     * flag can_view_cost (que se enciende solo al crear gerentes con tienda y
     * el admin puede revocar en Permisos de Precios). Usado por TODOS los
     * Resources que exponen `cost` — antes cada uno repetía su propia versión
     * y SaleItem/PreSaleOrderItem ignoraban el flag.
     */
    public function canViewCost(): bool
    {
        return $this->isAdminRole() || (bool) $this->can_view_cost;
    }

    /**
     * Gate de edición de la tienda online (catálogo): admin siempre; el resto
     * vía el flag can_edit_catalog que el admin enciende en Permisos. Espejo de
     * canViewCost(). Lo usa CatalogController para gatear las 6 rutas admin.
     */
    public function canEditCatalog(): bool
    {
        return $this->isAdminRole() || (bool) $this->can_edit_catalog;
    }

    /**
     * Scope de tienda server-side: admin opera sobre cualquier tienda; gerente y
     * cajero SOLO sobre la suya. Un usuario sin store_id no puede operar ninguna
     * (fail-closed). Usado por los guards de escritura cross-tienda.
     */
    public function canActOnStore(int|string|null $storeId): bool
    {
        if ($this->isAdminRole()) {
            return true;
        }

        return $this->store_id !== null
            && $storeId !== null
            && (int) $storeId === (int) $this->store_id;
    }
}
