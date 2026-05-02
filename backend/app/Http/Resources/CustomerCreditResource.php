<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class CustomerCreditResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'          => $this->id,
            'customer_id' => $this->customer_id,
            'amount'      => $this->amount,
            'reason'      => $this->reason,
            'created_at'  => $this->created_at?->toISOString(),
        ];
    }
}
