<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class PreSaleOrderResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'              => $this->id,
            'code'            => $this->code,
            'status'              => $this->status,
            // ADR-016 — rollback liquidación deja status='ready' pero la preventa
            // tuvo una liquidación reversada. Frontend muestra badge específico.
            'cancellation_status' => $this->cancellation_status ?? 'none',
            'last_cancelled_at'   => $this->last_cancelled_at?->toISOString(),
            'linked_sale_id'      => $this->linked_sale_id,
            'pickup_deadline' => $this->pickup_deadline?->toDateString(),
            'notes'           => $this->notes,
            'created_at'      => $this->created_at,
            'updated_at'      => $this->updated_at,

            'store' => $this->when($this->relationLoaded('store'), fn () => [
                'id'   => $this->store?->id,
                'name' => $this->store?->name,
            ]),
            'user' => $this->when($this->relationLoaded('user'), fn () => [
                'id'   => $this->user?->id,
                'name' => $this->user?->name,
            ]),
            'customer' => $this->when($this->relationLoaded('customer'), fn () => [
                'id'    => $this->customer?->id,
                'name'  => $this->customer?->name,
                'email' => $this->customer?->email,
                'phone' => $this->customer?->phone,
            ]),

            'items'    => $this->when($this->relationLoaded('items'),    fn () => PreSaleOrderItemResource::collection($this->items)),
            'payments' => $this->when($this->relationLoaded('payments'), fn () => PreSaleOrderPaymentResource::collection($this->payments)),

            'total'       => $this->when($this->relationLoaded('items'),    fn () => $this->total),
            'paid_amount' => $this->when($this->relationLoaded('payments'), fn () => $this->paid_amount),
            'balance'     => $this->when(
                $this->relationLoaded('items') && $this->relationLoaded('payments'),
                fn () => $this->balance
            ),
        ];
    }
}
