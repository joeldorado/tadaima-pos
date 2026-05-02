<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

class StoreResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'         => $this->id,
            'company_id' => $this->company_id,
            'name'       => $this->name,
            'address'    => $this->address,
            'phone'      => $this->phone,
            'email'      => $this->email,
            'manager_id' => $this->manager_id,
            'active'     => $this->active,

            'company' => $this->when(
                $this->relationLoaded('company') && $this->company,
                fn () => [
                    'id'   => $this->company->id,
                    'name' => $this->company->name,
                ],
            ),

            'manager' => $this->when(
                $this->relationLoaded('manager') && $this->manager,
                fn () => [
                    'id'   => $this->manager->id,
                    'name' => $this->manager->name,
                ],
            ),

            'payment_methods' => $this->when(
                $this->relationLoaded('paymentMethods'),
                fn () => PaymentMethodResource::collection($this->paymentMethods),
            ),

            'warehouses_count' => $this->when(
                $this->relationLoaded('warehouses'),
                fn () => $this->warehouses->count(),
            ),

            'created_at' => $this->created_at?->toISOString(),
            'updated_at' => $this->updated_at?->toISOString(),
        ];
    }
}
