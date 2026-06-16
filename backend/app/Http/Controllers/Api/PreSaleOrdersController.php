<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\AddPreSaleOrderPaymentRequest;
use App\Http\Requests\StorePreSaleOrderRequest;
use App\Http\Requests\UpdatePreSaleOrderStatusRequest;
use App\Http\Resources\PreSaleOrderItemResource;
use App\Http\Resources\PreSaleOrderPaymentResource;
use App\Http\Resources\PreSaleOrderResource;
use App\Mail\FolioCreatedMail;
use App\Models\PreSaleOrder;
use App\Models\PreSaleOrderItem;
use App\Models\PreSaleOrderLog;
use App\Models\SaleCancellation;
use App\Services\PreSaleOrderService;
use App\Services\SaleCancellationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Mail;

class PreSaleOrdersController extends Controller
{
    public function __construct(private readonly PreSaleOrderService $service) {}

    /**
     * GET /pre-sale-orders
     *
     * Query params: store_id, customer_id, status, code, catalog_id, from, to, per_page
     */
    public function index(Request $request): JsonResponse
    {
        $user  = $request->user();
        // RBAC: admin (cualquier variante) ve todas las tiendas; gerente y cajero
        // sólo ven los folios de su propia tienda. Antes el scope solo cubría
        // 'cajero', así el gerente caía al fallback "filtrar por request" y
        // como el frontend no manda store_id, no veía sus folios asignados.
        $isAdminUser = $user->hasRole(['admin', 'super_admin', 'owner', 'dueño']);
        // payments.paymentMethod se carga para que la lista de Ventas (frontend)
        // muestre el método de pago de anticipos/liquidaciones sin caer en N+1.
        $query = PreSaleOrder::with(['store', 'user', 'customer', 'items.catalog', 'payments.paymentMethod', 'cancellations'])
            ->when(!$isAdminUser,                   fn ($q) => $q->where('store_id', $user->store_id))
            ->when($isAdminUser && $request->filled('store_id'), fn ($q) => $q->where('store_id', $request->store_id))
            ->when($request->filled('customer_id'), fn ($q) => $q->where('customer_id', $request->customer_id))
            ->when($request->filled('code'),        fn ($q) => $q->where('code',        $request->code))
            ->when($request->filled('status'), function ($q) use ($request) {
                $statuses = array_filter(explode(',', (string) $request->status));
                return count($statuses) > 1
                    ? $q->whereIn('status', $statuses)
                    : $q->where('status', $statuses[0]);
            })
            ->when($request->filled('catalog_id'),  fn ($q) => $q->whereHas('items', fn ($s) => $s->where('pre_sale_catalog_id', $request->catalog_id)))
            // Fechas LOCAL del frontend (MX) → UTC range para comparar con
            // created_at guardado en UTC. Sin esto, folio creado a las 19:00 MX
            // (= 01:00 UTC del día sig) no matchea con filter 'Hoy' del cajero.
            ->when(\App\Support\DateRange::fromUtc($request->from), fn ($q, $from) => $q->where('created_at', '>=', $from))
            ->when(\App\Support\DateRange::toUtc($request->to),     fn ($q, $to)   => $q->where('created_at', '<=', $to))
            ->latest();

        $perPage = min((int) ($request->per_page ?? 25), 500);
        $results = $query->paginate($perPage);

        return $this->success([
            'data'       => PreSaleOrderResource::collection($results->items()),
            'pagination' => [
                'total'        => $results->total(),
                'per_page'     => $results->perPage(),
                'current_page' => $results->currentPage(),
                'last_page'    => $results->lastPage(),
            ],
        ]);
    }

    /**
     * POST /pre-sale-orders
     *
     * Creates a new folio. customer_id is required by design.
     */
    public function store(StorePreSaleOrderRequest $request): JsonResponse
    {
        // Guard cross-tienda: el store_id del body debe ser la tienda del
        // usuario (admin: cualquiera). Antes solo se validaba `exists`.
        if ($resp = $this->storeScopeError($request, $request->validated()['store_id'] ?? null)) {
            return $resp;
        }

        try {
            $order = $this->service->createOrder($request->validated(), $request->user()->id);

            // Send confirmation email if customer has an email address.
            // Wrapped in try/catch so a mail failure never blocks the response.
            if ($order->customer?->email) {
                try {
                    Mail::to($order->customer->email)->send(new FolioCreatedMail($order));
                } catch (\Throwable) {
                    // Log silently — mail is best-effort
                    \Log::warning("FolioCreatedMail failed for order {$order->code}");
                }
            }

            return $this->success(new PreSaleOrderResource($order), 201);
        } catch (\DomainException $e) {
            return $this->error($e->getMessage(), 422);
        }
    }

    /**
     * GET /pre-sale-orders/{id}
     */
    public function show(int $id): JsonResponse
    {
        $order = PreSaleOrder::with([
            'store', 'user', 'customer',
            'items.catalog', 'items.product',
            'payments.paymentMethod', 'payments.cashier',
            'logs.user',
        ])->findOrFail($id);

        // RBAC: gerente/cajero solo pueden ver folios de su propia tienda.
        $user = request()->user();
        $isAdminUser = $user && $user->hasRole(['admin', 'super_admin', 'owner', 'dueño']);
        if (!$isAdminUser && (int) $order->store_id !== (int) ($user->store_id ?? 0)) {
            return $this->error('No tienes acceso a este folio.', 403);
        }

        return $this->success(new PreSaleOrderResource($order));
    }

    /**
     * POST /pre-sale-orders/{id}/payments
     *
     * Adds an anticipo or partial payment to the folio.
     */
    public function addPayment(AddPreSaleOrderPaymentRequest $request, int $id): JsonResponse
    {
        $order = PreSaleOrder::findOrFail($id);

        if ($resp = $this->storeScopeError($request, $order->store_id)) {
            return $resp;
        }

        try {
            $payment = $this->service->addPayment($order, $request->validated(), $request->user()->id);

            return $this->success(new PreSaleOrderPaymentResource($payment), 201);
        } catch (\DomainException $e) {
            return $this->error($e->getMessage(), 422);
        }
    }

    /**
     * PATCH /pre-sale-orders/{id}/status
     *
     * Transitions the folio to: ready | delivered | expired | cancelled
     */
    public function updateStatus(UpdatePreSaleOrderStatusRequest $request, int $id): JsonResponse
    {
        $order  = PreSaleOrder::findOrFail($id);

        if ($resp = $this->storeScopeError($request, $order->store_id)) {
            return $resp;
        }

        $status = $request->validated()['status'];
        $notes  = $request->validated()['notes'] ?? null;

        try {
            $updated = match ($status) {
                'ready'     => $this->service->markReady(
                                   $order,
                                   $request->user()->id,
                                   $request->validated()['pickup_deadline'] ?? null,
                                   $notes
                               ),
                'delivered' => $this->service->liquidate($order, $request->user()->id, $notes),
                'expired'   => $this->service->expire($order, $request->user()->id, $notes),
                'cancelled' => $this->service->cancel($order, $request->user()->id, $notes),
            };

            return $this->success(new PreSaleOrderResource($updated));
        } catch (\DomainException $e) {
            return $this->error($e->getMessage(), 422);
        }
    }

    /**
     * PATCH /pre-sale-orders/{id}/items/{itemId}/deliver
     *
     * Toggles a single item's delivery status (pending ↔ delivered).
     */
    public function deliverItem(Request $request, int $id, int $itemId): JsonResponse
    {
        $parentOrder = PreSaleOrder::findOrFail($id);
        if ($resp = $this->storeScopeError($request, $parentOrder->store_id)) {
            return $resp;
        }

        $item   = PreSaleOrderItem::where('pre_sale_order_id', $id)->findOrFail($itemId);
        $status = $request->validate(['status' => 'required|in:pending,delivered'])['status'];

        $item->update([
            'status'       => $status,
            'delivered_at' => $status === 'delivered' ? now() : null,
        ]);

        // Auto-close the folio when all items are now delivered
        if ($status === 'delivered') {
            $order = PreSaleOrder::find($id);
            if ($order && $order->status === PreSaleOrder::STATUS_READY) {
                $pendingCount = PreSaleOrderItem::where('pre_sale_order_id', $id)
                    ->where('status', PreSaleOrderItem::STATUS_PENDING)
                    ->count();

                if ($pendingCount === 0) {
                    $order->update(['status' => PreSaleOrder::STATUS_DELIVERED]);
                    PreSaleOrderLog::create([
                        'pre_sale_order_id' => $id,
                        'user_id'           => $request->user()->id,
                        'from_status'       => PreSaleOrder::STATUS_READY,
                        'to_status'         => PreSaleOrder::STATUS_DELIVERED,
                        'notes'             => 'Todos los ítems entregados — folio liquidado.',
                    ]);
                }
            }
        }

        return $this->success(new PreSaleOrderItemResource($item));
    }

    /**
     * POST /pre-sale-orders/{id}/cancel — ADR-016.
     *
     * Body: {
     *   mode:          'full' | 'liquidation_rollback'
     *   reason_code:   'cliente_devuelve'|'error_cajero'|'dañado'|'no_llego'|'otro'
     *   reason_text?:  string
     *   cash_session_id?: int
     * }
     *
     * - mode='full' → cancela el folio entero (status='cancelled'), reversa todos los pagos,
     *   restaura stock si estaba delivered.
     * - mode='liquidation_rollback' → preventa delivered → ready, reversa solo el último
     *   payment (la liquidación), restaura stock entregado, items.delivered_at=null.
     */
    public function cancel(int $id, Request $request, SaleCancellationService $service): JsonResponse
    {
        $order = PreSaleOrder::findOrFail($id);

        if ($resp = $this->storeScopeError($request, $order->store_id)) {
            return $resp;
        }

        $data = $request->validate([
            'mode'            => ['required', 'string', 'in:full,liquidation_rollback'],
            'reason_code'     => ['required', 'string', 'in:cliente_devuelve,error_cajero,dañado,no_llego,otro'],
            'reason_text'     => ['nullable', 'string', 'max:500'],
            'cash_session_id' => ['nullable', 'integer', 'exists:cash_register_sessions,id'],
        ]);

        try {
            $cancellation = $service->cancelPreSaleOrder(
                order: $order,
                mode: $data['mode'],
                reasonCode: $data['reason_code'],
                reasonText: $data['reason_text'] ?? null,
                cancelledBy: $request->user(),
                activeSessionId: $data['cash_session_id'] ?? null,
            );
        } catch (\DomainException $e) {
            return $this->error($e->getMessage(), 422);
        }

        $order->refresh()->load(['items.product', 'payments', 'customer']);
        return $this->success([
            'order'        => new PreSaleOrderResource($order),
            'cancellation' => [
                'id'              => $cancellation->id,
                'mode'            => $cancellation->mode,
                'amount_refunded' => (float) $cancellation->amount_refunded,
                'cash_movement_id'=> $cancellation->cash_movement_id,
            ],
        ], 'Cancelación registrada correctamente.');
    }
}
