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
            'active'        => $this->active,
            'can_view_cost' => $this->can_view_cost,
            'company_id'    => $this->company_id,
            'store_id'      => $this->store_id,

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
