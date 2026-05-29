<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Resources\SaleCancellationResource;
use App\Models\SaleCancellation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

/**
 * ADR-016 Fase 4 — Lectura del log de cancelaciones.
 *
 * Endpoint usado por:
 *  - El Reporte del Día → sección H (breakdown por motivo + cajero).
 *  - La vista admin /admin/cancelaciones (tabla con filtros + histórico).
 */
class SaleCancellationsController extends Controller
{
    /**
     * GET /sale-cancellations
     *
     * Query params:
     *   ?from=YYYY-MM-DD
     *   ?to=YYYY-MM-DD
     *   ?store_id=N            (filtra por tienda — joina sale o presale)
     *   ?reason_code=cliente_devuelve
     *   ?cancelled_by=user_id
     *   ?per_page=50           (default 50, max 200)
     */
    public function index(Request $request): JsonResponse
    {
        $perPage = min(200, max(1, (int) ($request->per_page ?? 50)));

        $query = SaleCancellation::query()
            ->with(['cancelledByUser:id,name', 'sale:id,store_id,status,cancellation_status,total,sold_at', 'preSaleOrder:id,code,store_id,status,cancellation_status'])
            ->orderByDesc('cancelled_at');

        if ($request->filled('from')) {
            $query->whereDate('cancelled_at', '>=', $request->from);
        }
        if ($request->filled('to')) {
            $query->whereDate('cancelled_at', '<=', $request->to);
        }
        if ($request->filled('reason_code')) {
            $query->where('reason_code', $request->reason_code);
        }
        if ($request->filled('cancelled_by')) {
            $query->where('cancelled_by', (int) $request->cancelled_by);
        }
        if ($request->filled('store_id')) {
            $storeId = (int) $request->store_id;
            $query->where(function ($q) use ($storeId) {
                $q->whereHas('sale', fn ($sq) => $sq->where('store_id', $storeId))
                  ->orWhereHas('preSaleOrder', fn ($pq) => $pq->where('store_id', $storeId));
            });
        }

        $paginated = $query->paginate($perPage);

        return $this->success([
            'data'       => SaleCancellationResource::collection($paginated->items()),
            'pagination' => [
                'current_page' => $paginated->currentPage(),
                'last_page'    => $paginated->lastPage(),
                'total'        => $paginated->total(),
                'per_page'     => $paginated->perPage(),
            ],
        ]);
    }
}
