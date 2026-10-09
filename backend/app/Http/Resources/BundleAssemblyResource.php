<?php

declare(strict_types=1);

namespace App\Http\Resources;

use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Http\Resources\Json\JsonResource;

/** Un renglón de la bitácora de armados/desarmados (Paquetes, 2026-10-07). */
class BundleAssemblyResource extends JsonResource
{
    public function toArray(Request $request): array
    {
        $user = $request->user();
        $canViewCost = $user instanceof User && $user->canViewCost();

        $components = array_map(function (array $c) use ($canViewCost) {
            if (! $canViewCost) {
                unset($c['unit_cost']);
            }

            return $c;
        }, (array) ($this->components_snapshot ?? []));

        return [
            'id' => $this->id,
            'type' => $this->type,
            'quantity' => (int) $this->quantity,
            'store' => $this->relationLoaded('store') && $this->store
                ? ['id' => $this->store->id, 'name' => $this->store->name]
                : null,
            'warehouse' => $this->relationLoaded('warehouse') && $this->warehouse
                ? ['id' => $this->warehouse->id, 'name' => $this->warehouse->name, 'type' => $this->warehouse->type]
                : null,
            'user' => $this->relationLoaded('user') && $this->user
                ? ['id' => $this->user->id, 'name' => $this->user->name]
                : null,
            'notes' => $this->notes,
            'components' => array_values($components),
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
