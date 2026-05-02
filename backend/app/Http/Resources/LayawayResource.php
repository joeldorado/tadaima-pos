<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class LayawayResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $paymentsLoaded = $this->relationLoaded('payments');

        return [
            'id'           => $this->id,
            'code'         => $this->code,
            'store_id'     => $this->store_id,
            'user_id'      => $this->user_id,
            'customer_id'  => $this->customer_id,
            'product_id'   => $this->product_id,
            'warehouse_id' => $this->warehouse_id,
            'quantity'     => $this->quantity,
            'price'        => $this->price,
            'total'        => $this->total,
            'down_payment' => $this->down_payment,
            'status'       => $this->status,
            'expires_at'   => $this->expires_at?->toDateString(),
            'notes'        => $this->notes,
            'created_at'   => $this->created_at?->toISOString(),
            'updated_at'   => $this->updated_at?->toISOString(),

            // Computed — only when payments are loaded
            'paid_amount' => $paymentsLoaded ? $this->paid_amount : null,
            'balance'     => $paymentsLoaded ? $this->balance : null,

            // Relations
            'product'  => $this->when($this->relationLoaded('product'), fn () => [
                'id'   => $this->product->id,
                'name' => $this->product->name,
                'sku'  => $this->product->sku,
            ]),
            'customer' => $this->when($this->relationLoaded('customer'), fn () => [
                'id'    => $this->customer->id,
                'name'  => $this->customer->name,
                'phone' => $this->customer->phone,
                'email' => $this->customer->email,
            ]),
            'payments' => $this->when(
                $paymentsLoaded,
                fn () => LayawayPaymentResource::collection($this->payments)
            ),
            'logs' => $this->when(
                $this->relationLoaded('logs'),
                fn () => LayawayLogResource::collection($this->logs)
            ),
        ];
    }
}
