<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class CompanyResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'         => $this->id,
            'name'       => $this->name,
            'rfc'        => $this->rfc,
            'address'    => $this->address,
            'phone'      => $this->phone,
            'email'      => $this->email,
            'logo_path'  => $this->logo_path,
            'active'     => $this->active,

            'stores_count' => $this->when(
                $this->relationLoaded('stores'),
                fn () => $this->stores->count(),
            ),

            'created_at' => $this->created_at?->toISOString(),
            'updated_at' => $this->updated_at?->toISOString(),
        ];
    }
}
