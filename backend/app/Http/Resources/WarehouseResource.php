<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class WarehouseResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'          => $this->id,
            'company_id'  => $this->company_id,
            'store_id'    => $this->store_id,
            'name'        => $this->store ? $this->store->name : $this->name,
            'type'        => $this->type,
            'description' => $this->description,
            'active'      => $this->active,

            'store' => $this->when(
                $this->relationLoaded('store') && $this->store,
                fn () => [
                    'id'   => $this->store->id,
                    'name' => $this->store->name,
                ],
            ),

            'created_at' => $this->created_at?->toISOString(),
            'updated_at' => $this->updated_at?->toISOString(),
        ];
    }
}
