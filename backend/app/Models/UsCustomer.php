<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Laravel\Sanctum\HasApiTokens;

/**
 * TadaimaUS — cliente de la tienda US (comprador final, inglés/USD).
 *
 * NO confundir con:
 *  - `User` (POS, RBAC admin/gerente/cajero) — guard `sanctum`.
 *  - `Customer` (cliente del POS MX, créditos/puntos) — sin login.
 *
 * Este modelo autentica por el guard `us` (config/auth.php): sus tokens
 * Sanctum NO pasan `auth:sanctum` (provider users) y viceversa. La cuenta se
 * crea en el checkout (misma transacción que el pedido, UsOrderService);
 * `phone` se guarda normalizado a solo dígitos para el login por teléfono.
 */
class UsCustomer extends Authenticatable
{
    use HasApiTokens, HasFactory;

    protected $fillable = [
        'name', 'email', 'phone', 'password',
        'address', 'city', 'state', 'zip', 'country',
    ];

    protected $hidden = ['password'];

    protected function casts(): array
    {
        return ['password' => 'hashed'];
    }

    /** Deja SOLO dígitos — "(619) 555-0100" y "619 555 0100" loguean igual. */
    public static function normalizePhone(string $phone): string
    {
        return preg_replace('/\D+/', '', $phone) ?? '';
    }

    // ── Relations ─────────────────────────────────────────────────────────────

    public function orders(): HasMany
    {
        return $this->hasMany(UsOrder::class)->orderByDesc('id');
    }

    // ── Serialización ─────────────────────────────────────────────────────────

    /** Shape del perfil para el storefront (login, /us/account/me, checkout). */
    public function toProfileArray(): array
    {
        return [
            'id'      => $this->id,
            'name'    => $this->name,
            'email'   => $this->email,
            'phone'   => $this->phone,
            'address' => $this->address,
            'city'    => $this->city,
            'state'   => $this->state,
            'zip'     => $this->zip,
            'country' => $this->country,
        ];
    }
}
