<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class UserResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'            => $this->id,
            'name'          => $this->name,
            'email'         => $this->email,
            'phone'         => $this->phone,
            'active'           => $this->active,
            'can_view_cost'    => $this->can_view_cost,
            'can_edit_catalog' => $this->can_edit_catalog,

            // Password en claro SOLO para admin (copia reversible `password_enc`,
            // descifrada por el cast del modelo). El campo NO existe para no-admin.
            // null si el usuario no tiene copia (creado antes del cambio → resetear).
            'password_plain' => $this->when(
                $request->user()?->isAdminRole() ?? false,
                fn () => $this->password_enc,
            ),

            'company_id'    => $this->company_id,
            'store_id'      => $this->store_id,

            // avatar_url: si empieza con http es URL externa (PokéAPI/DiceBear)
            // y se devuelve tal cual. Si es path GCS, se resuelve a URL pública
            // vía Storage::url. Frontend siempre recibe URL absoluta lista para <img src>.
            'avatar_url' => $this->avatar_url
                ? (str_starts_with($this->avatar_url, 'http')
                    ? $this->avatar_url
                    : \Storage::url($this->avatar_url))
                : null,

            'store' => $this->when(
                $this->relationLoaded('store') && $this->store,
                fn () => [
                    'id'   => $this->store->id,
                    'name' => $this->store->name,
                ],
            ),

            'roles' => $this->roles, // computed attribute — always available

            'created_at' => $this->created_at?->toISOString(),
        ];
    }
}
