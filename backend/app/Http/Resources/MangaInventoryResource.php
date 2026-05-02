<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class MangaInventoryResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'           => $this->id,
            'manga_id'     => $this->manga_id,
            'warehouse_id' => $this->warehouse_id,
            'quantity'     => $this->quantity,

            'warehouse' => $this->when(
                $this->relationLoaded('warehouse'),
                fn () => [
                    'id'    => $this->warehouse->id,
                    'name'  => $this->warehouse->name,
                    'type'  => $this->warehouse->type,
                    'store' => $this->warehouse->store
                        ? ['id' => $this->warehouse->store->id, 'name' => $this->warehouse->store->name]
                        : null,
                ],
            ),
        ];
    }
}
