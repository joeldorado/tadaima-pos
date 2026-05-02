<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class CashRegisterSessionResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $movementsLoaded = $this->relationLoaded('movements');

        return [
            'id'           => $this->id,
            'register_id'  => $this->register_id,
            'user_id'      => $this->user_id,
            'status'       => $this->status,
            'opening_cash' => $this->opening_cash,
            'closing_cash' => $this->closing_cash,
            'opened_at'    => $this->opened_at?->toISOString(),
            'closed_at'    => $this->closed_at?->toISOString(),

            'balance' => $movementsLoaded ? $this->balance : null,

            'register' => $this->when(
                $this->relationLoaded('register') && $this->register,
                fn () => [
                    'id'       => $this->register->id,
                    'name'     => $this->register->name,
                    'store_id' => $this->register->store_id,
                ],
            ),

            'user' => $this->when(
                $this->relationLoaded('user') && $this->user,
                fn () => [
                    'id'   => $this->user->id,
                    'name' => $this->user->name,
                ],
            ),

            'movements' => $this->when(
                $movementsLoaded,
                fn () => CashMovementResource::collection($this->movements),
            ),
        ];
    }
}
