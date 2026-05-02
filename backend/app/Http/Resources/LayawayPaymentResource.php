<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class LayawayPaymentResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'                => $this->id,
            'layaway_id'        => $this->layaway_id,
            'amount'            => $this->amount,
            'payment_method_id' => $this->payment_method_id,
            'payment_method'    => $this->when(
                $this->relationLoaded('paymentMethod') && $this->paymentMethod,
                fn () => ['id' => $this->paymentMethod->id, 'name' => $this->paymentMethod->name]
            ),
            'notes'      => $this->notes,
            'created_at' => $this->created_at?->toISOString(),
        ];
    }
}
