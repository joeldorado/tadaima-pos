<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class TerminalResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'                 => $this->id,
            'store_id'           => $this->store_id,
            'name'               => $this->name,
            'commission_percent' => $this->commission_percent,
            'active'             => $this->active,

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
