<?php

declare(strict_types=1);

namespace App\Services;

use App\Models\Customer;
use App\Models\PointTransaction;
use Illuminate\Support\Facades\DB;

class PointsService
{
    /**
     * Awards loyalty points to a customer for a completed sale or pre-sale.
     *
     * - Reads `points_multiplier` from system_settings (default 0.001).
     * - points = floor(amount * multiplier)
     * - Idempotent: silently skips if a PointTransaction for (reference_type, reference_id) already exists.
     *
     * @return array{customer_id:int, points_awarded:int, new_total:int}
     */
    public function award(
        int $customerId,
        float $amount,
        string $reason,
        string $referenceType,
        int $referenceId
    ): array {
        $multiplier = (float) DB::table('system_settings')
            ->where('key', 'points_multiplier')
            ->value('value') ?: 0.001;

        $points = (int) floor(max(0.0, $amount) * $multiplier);

        if ($points <= 0) {
            return [
                'customer_id'    => $customerId,
                'points_awarded' => 0,
                'new_total'      => Customer::find($customerId)?->points ?? 0,
            ];
        }

        return DB::transaction(function () use (
            $customerId, $points, $reason, $referenceType, $referenceId
        ) {
            // Idempotency guard — skip silently if already awarded
            $exists = PointTransaction::where('reference_type', $referenceType)
                ->where('reference_id', $referenceId)
                ->exists();

            if ($exists) {
                $customer = Customer::lockForUpdate()->find($customerId);
                return [
                    'customer_id'    => $customerId,
                    'points_awarded' => 0,
                    'new_total'      => $customer?->points ?? 0,
                ];
            }

            $customer = Customer::lockForUpdate()->findOrFail($customerId);
            $customer->increment('points', $points);

            PointTransaction::create([
                'customer_id'    => $customerId,
                'points'         => $points,
                'reason'         => $reason,
                'reference_type' => $referenceType,
                'reference_id'   => $referenceId,
            ]);

            return [
                'customer_id'    => $customerId,
                'points_awarded' => $points,
                'new_total'      => $customer->fresh()->points,
            ];
        });
    }
}
