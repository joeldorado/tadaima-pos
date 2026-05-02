<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;
use Illuminate\Support\Facades\Storage;

class MangaResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $user = $request->user();
        $canViewCost = $user?->hasRole(['admin', 'super_admin', 'owner', 'dueño']) && ($user->can_view_cost ?? false);

        return [
            'id'                    => $this->id,
            'name'                  => $this->name,
            'volume_number'         => $this->volume_number,
            'editorial'             => $this->editorial,
            'code'                  => $this->code,
            'genre'                 => $this->genre,
            'public_price'          => $this->public_price,
            'profit_margin_percent' => $this->when($canViewCost, $this->profit_margin_percent),
            'cost'                  => $this->when($canViewCost, $this->cost),
            'active'                => $this->active,
            'price_1'               => $this->price_1,
            'price_2'               => $this->price_2,
            'price_3'               => $this->price_3,
            'price_4'               => $this->price_4,
            'price_5'               => $this->price_5,
            'stock'                 => $this->inventory_sum_quantity ?? $this->stock ?? 0,
            'image_url'             => $this->image_path ? url(Storage::url($this->image_path)) : null,
            'created_at'            => $this->created_at?->toISOString(),
            'updated_at'            => $this->updated_at?->toISOString(),
        ];
    }
}
