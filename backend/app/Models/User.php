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
        'name', 'email', 'password',
        'company_id', 'store_id', 'phone', 'address', 'active', 'can_view_cost',
        'avatar_url',
    ];

    protected $hidden = ['password', 'remember_token'];

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password'          => 'hashed',
            'active'            => 'boolean',
            'can_view_cost'     => 'boolean',
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
}
