<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class LayawayLogResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'         => $this->id,
            'layaway_id' => $this->layaway_id,
            'action'     => $this->action,
            'user_id'    => $this->user_id,
            'notes'      => $this->notes,
            'created_at' => $this->created_at?->toISOString(),
        ];
    }
}
