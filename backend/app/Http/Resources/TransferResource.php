<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class TransferResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'                => $this->id,
            'from_warehouse_id' => $this->from_warehouse_id,
            'to_warehouse_id'   => $this->to_warehouse_id,
            'user_id'           => $this->user_id,
            'status'            => $this->status,
            'notes'             => $this->notes,

            'from_warehouse' => $this->when(
                $this->relationLoaded('fromWarehouse') && $this->fromWarehouse,
                fn () => [
                    'id'   => $this->fromWarehouse->id,
                    'name' => $this->fromWarehouse->name,
                ],
            ),

            'to_warehouse' => $this->when(
                $this->relationLoaded('toWarehouse') && $this->toWarehouse,
                fn () => [
                    'id'   => $this->toWarehouse->id,
                    'name' => $this->toWarehouse->name,
                ],
            ),

            'user' => $this->when(
                $this->relationLoaded('user') && $this->user,
                fn () => [
                    'id'   => $this->user->id,
                    'name' => $this->user->name,
                ],
            ),

            'items' => $this->when(
                $this->relationLoaded('items'),
                fn () => TransferItemResource::collection($this->items),
            ),

            'created_at' => $this->created_at?->toISOString(),
            'updated_at' => $this->updated_at?->toISOString(),
        ];
    }
}
