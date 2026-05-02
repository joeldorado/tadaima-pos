<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreLayawayRequest;
use App\Http\Requests\StoreLayawayPaymentRequest;
use App\Http\Requests\UpdateLayawayRequest;
use App\Http\Requests\UpdateLayawayStatusRequest;
use App\Http\Resources\LayawayPaymentResource;
use App\Http\Resources\LayawayResource;
use App\Http\Resources\SaleResource;
use App\Models\Layaway;
use App\Services\LayawayService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class LayawayController extends Controller
{
    public function __construct(private readonly LayawayService $service) {}

    /**
     * GET /layaways
     *
     * Query params: store_id, customer_id, product_id, status, code,
     *               from (Y-m-d), to (Y-m-d), per_page
     */
    public function index(Request $request): JsonResponse
    {
        $query = Layaway::with(['product', 'customer', 'payments'])
            ->when($request->filled('store_id'),    fn ($q) => $q->where('store_id',    $request->store_id))
            ->when($request->filled('customer_id'), fn ($q) => $q->where('customer_id', $request->customer_id))
            ->when($request->filled('product_id'),  fn ($q) => $q->where('product_id',  $request->product_id))
            ->when($request->filled('code'),        fn ($q) => $q->where('code',        $request->code))
            ->when($request->get('status') === 'open', fn ($q) => $q->open())
            ->when(
                $request->filled('status') && $request->get('status') !== 'open',
                fn ($q) => $q->where('status', $request->status)
            )
            ->when($request->filled('from'), fn ($q) => $q->whereDate('created_at', '>=', $request->from))
            ->when($request->filled('to'),   fn ($q) => $q->whereDate('created_at', '<=', $request->to))
            ->latest();

        $perPage = min((int) ($request->per_page ?? 25), 100);
        $results = $query->paginate($perPage);

        return $this->success([
            'data'       => LayawayResource::collection($results->items()),
            'pagination' => [
                'total'        => $results->total(),
                'per_page'     => $results->perPage(),
                'current_page' => $results->currentPage(),
                'last_page'    => $results->lastPage(),
            ],
        ]);
    }

    /**
     * POST /layaways
     * Creates a layaway, reserves inventory, and records down payment.
     */
    public function store(StoreLayawayRequest $request): JsonResponse
    {
        try {
            $layaway = $this->service->create(
                $request->only([
                    'store_id', 'customer_id', 'product_id', 'warehouse_id',
                    'quantity', 'price', 'down_payment', 'payment_method_id',
                    'expires_at', 'notes',
                ]),
                $request->user()->id,
            );
        } catch (\DomainException $e) {
            return $this->error($e->getMessage(), 422);
        }

        return $this->success(new LayawayResource($layaway), 'Apartado creado.', 201);
    }

    /**
     * GET /layaways/by-product/{product}
     * Returns open layaways for a given product (product-centric entry point).
     */
    public function byProduct(Request $request, int $productId): JsonResponse
    {
        $layaways = Layaway::with(['customer', 'payments'])
            ->where('product_id', $productId)
            ->open()
            ->when($request->filled('store_id'), fn ($q) => $q->where('store_id', $request->store_id))
            ->latest()
            ->get();

        return $this->success(LayawayResource::collection($layaways));
    }

    /**
     * GET /layaways/{layaway}
     */
    public function show(Layaway $layaway): JsonResponse
    {
        $layaway->load(['product', 'customer', 'payments.paymentMethod', 'logs']);

        return $this->success(new LayawayResource($layaway));
    }

    /**
     * PATCH /layaways/{layaway}
     * Updates notes and/or expiry date.
     */
    public function update(UpdateLayawayRequest $request, Layaway $layaway): JsonResponse
    {
        if (! in_array($layaway->status, Layaway::OPEN_STATUSES)) {
            return $this->error("No se puede editar el apartado (estado: {$layaway->status}).", 422);
        }

        $layaway->update($request->only(['notes', 'expires_at']));
        $layaway->load(['product', 'customer', 'payments.paymentMethod', 'logs']);

        return $this->success(new LayawayResource($layaway), 'Apartado actualizado.');
    }

    /**
     * PATCH /layaways/{layaway}/status
     * Handles delivered (→ Sale) and cancelled (→ release inventory + credit).
     */
    public function updateStatus(UpdateLayawayStatusRequest $request, Layaway $layaway): JsonResponse
    {
        $newStatus = $request->status;
        $userId    = $request->user()->id;

        try {
            if ($newStatus === 'delivered') {
                $sale = $this->service->deliver($layaway, $userId);

                return $this->success(new SaleResource($sale), 'Apartado entregado. Venta generada.');
            }

            $layaway = $this->service->cancel($layaway, $userId, $request->input('notes'));
        } catch (\DomainException $e) {
            return $this->error($e->getMessage(), 422);
        }

        return $this->success(new LayawayResource($layaway), 'Apartado cancelado. Inventario liberado.');
    }

    /**
     * POST /layaways/{layaway}/payments
     * Adds a payment. Auto-transitions to 'paid' when balance = 0.
     */
    public function addPayment(StoreLayawayPaymentRequest $request, Layaway $layaway): JsonResponse
    {
        try {
            $payment = $this->service->addPayment(
                $layaway,
                $request->only(['amount', 'payment_method_id', 'notes']),
                $request->user()->id,
            );
        } catch (\DomainException $e) {
            return $this->error($e->getMessage(), 422);
        }

        $layaway->load('payments');

        return $this->success([
            'payment'     => new LayawayPaymentResource($payment),
            'paid_amount' => $layaway->paid_amount,
            'balance'     => $layaway->balance,
            'status'      => $layaway->fresh()->status,
        ], 'Abono registrado.', 201);
    }

    /**
     * GET /layaways/{layaway}/payments
     */
    public function payments(Layaway $layaway): JsonResponse
    {
        $layaway->load(['payments.paymentMethod']);

        return $this->success([
            'payments'    => LayawayPaymentResource::collection($layaway->payments),
            'total'       => $layaway->total,
            'paid_amount' => $layaway->paid_amount,
            'balance'     => $layaway->balance,
        ]);
    }
}
