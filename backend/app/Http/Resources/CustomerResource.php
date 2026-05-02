<?php

namespace App\Http\Resources;

use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/**
 * Formato JSON de cliente que consume el frontend.
 *
 * Notas de compatibilidad:
 *  - `tier`  → alias de loyalty_tier  (frontend usa 'tier')
 *  - `points`→ loyalty points          (campo en la tabla customers)
 *  - `credit_balance` → suma de customer_credit.amount (saldo a favor)
 */
class CustomerResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        return [
            'id'                 => $this->id,
            'external_member_id' => $this->external_member_id,
            'name'               => $this->name,
            'phone'              => $this->phone,
            'email'              => $this->email,
            'address'            => $this->address,
            'notes'              => $this->notes,

            // Lealtad
            'loyalty_tier'   => $this->loyalty_tier,
            'tier'           => $this->loyalty_tier ?? 'Bronce', // alias frontend
            'points'         => $this->points,

            // Saldo a favor (calculado con withSum)
            'credit_balance' => (float) ($this->credit_sum_amount ?? 0),

            // Créditos individuales (solo si la relación fue cargada)
            'credit' => $this->when(
                $this->relationLoaded('credit'),
                fn () => CustomerCreditResource::collection($this->credit),
            ),

            'created_at' => $this->created_at?->toISOString(),
            'updated_at' => $this->updated_at?->toISOString(),
        ];
    }
}
