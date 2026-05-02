<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\PointTransaction;
use App\Services\PointsService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class LoyaltyController extends Controller
{
    public function __construct(private readonly PointsService $service) {}

    /**
     * POST /loyalty/award
     * Awards points for a completed sale or pre-sale.
     */
    public function award(Request $request): JsonResponse
    {
        $data = $request->validate([
            'customer_id'    => ['required', 'integer', 'exists:customers,id'],
            'amount'         => ['required', 'numeric', 'min:0'],
            'reason'         => ['required', 'string', 'max:100'],
            'reference_type' => ['required', 'in:pre_sale,sale'],
            'reference_id'   => ['required', 'integer', 'min:1'],
        ]);

        $result = $this->service->award(
            customerId:    $data['customer_id'],
            amount:        (float) $data['amount'],
            reason:        $data['reason'],
            referenceType: $data['reference_type'],
            referenceId:   $data['reference_id'],
        );

        return $this->success($result, "Puntos otorgados: {$result['points_awarded']}.");
    }

    /**
     * GET /loyalty/customers/{customerId}/history
     * Returns the point transaction history for a customer.
     */
    public function history(int $customerId): JsonResponse
    {
        $transactions = PointTransaction::where('customer_id', $customerId)
            ->orderByDesc('created_at')
            ->limit(200)
            ->get();

        return $this->success($transactions);
    }
}
