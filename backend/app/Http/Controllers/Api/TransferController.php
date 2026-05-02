<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreTransferRequest;
use App\Http\Resources\TransferResource;
use App\Models\Transfer;
use App\Services\TransferService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TransferController extends Controller
{
    public function __construct(private readonly TransferService $service) {}

    /**
     * GET /transfers
     * Filters: from_warehouse_id, to_warehouse_id, status, from (date), to (date), per_page
     */
    public function index(Request $request): JsonResponse
    {
        $query = Transfer::with(['fromWarehouse', 'toWarehouse', 'user', 'items.product'])
            ->when($request->filled('from_warehouse_id'), fn ($q) => $q->where('from_warehouse_id', $request->from_warehouse_id))
            ->when($request->filled('to_warehouse_id'),   fn ($q) => $q->where('to_warehouse_id',   $request->to_warehouse_id))
            ->when($request->filled('status'),             fn ($q) => $q->where('status',             $request->status))
            ->when($request->filled('from'),               fn ($q) => $q->whereDate('created_at', '>=', $request->from))
            ->when($request->filled('to'),                 fn ($q) => $q->whereDate('created_at', '<=', $request->to))
            ->latest();

        $perPage = min((int) ($request->per_page ?? 25), 100);
        $results = $query->paginate($perPage);

        return $this->success([
            'data'       => TransferResource::collection($results->items()),
            'pagination' => [
                'total'        => $results->total(),
                'per_page'     => $results->perPage(),
                'current_page' => $results->currentPage(),
                'last_page'    => $results->lastPage(),
            ],
        ]);
    }

    /**
     * POST /transfers
     * Crea el traslado en estado pending (sin mover inventario aún).
     *
     * Body:
     * {
     *   from_warehouse_id, to_warehouse_id, notes?,
     *   items: [{ product_id, quantity }]
     * }
     */
    public function store(StoreTransferRequest $request): JsonResponse
    {
        try {
            $transfer = $this->service->create(
                data:      $request->only(['from_warehouse_id', 'to_warehouse_id', 'notes']),
                itemsData: $request->input('items'),
                userId:    $request->user()->id,
            );
        } catch (\DomainException $e) {
            return $this->error($e->getMessage(), 422);
        }

        return $this->success(new TransferResource($transfer), 'Traslado creado.', 201);
    }

    /**
     * GET /transfers/{transfer}
     * Incluye items con producto y ambas bodegas.
     */
    public function show(Transfer $transfer): JsonResponse
    {
        $transfer->load(['items.product', 'fromWarehouse', 'toWarehouse', 'user']);

        return $this->success(new TransferResource($transfer));
    }

    /**
     * GET /transfers/{transfer}/items
     * Alias de show — devuelve solo los ítems.
     */
    public function items(Transfer $transfer): JsonResponse
    {
        $transfer->load('items.product');

        return $this->success(\App\Http\Resources\TransferItemResource::collection($transfer->items));
    }

    /**
     * PUT /transfers/{transfer}/complete
     * Ejecuta el traslado: mueve inventario de bodega origen a destino.
     * Falla si algún producto no tiene stock suficiente en origen.
     */
    public function complete(Transfer $transfer): JsonResponse
    {
        try {
            $transfer = $this->service->complete($transfer, request()->user()->id);
        } catch (\DomainException $e) {
            return $this->error($e->getMessage(), 422);
        }

        return $this->success(new TransferResource($transfer), 'Traslado completado. Inventario actualizado.');
    }

    /**
     * PUT /transfers/{transfer}/cancel
     * Cancela el traslado (solo si está pending).
     */
    public function cancel(Transfer $transfer): JsonResponse
    {
        try {
            $transfer = $this->service->cancel($transfer);
        } catch (\DomainException $e) {
            return $this->error($e->getMessage(), 422);
        }

        return $this->success(new TransferResource($transfer), 'Traslado cancelado.');
    }
}
