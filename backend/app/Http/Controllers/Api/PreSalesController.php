<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StorePreSaleRequest;
use App\Http\Requests\StorePreSalePaymentRequest;
use App\Http\Requests\UpdatePreSaleRequest;
use App\Http\Requests\UpdatePreSaleStatusRequest;
use App\Http\Resources\PreSalePaymentResource;
use App\Http\Resources\PreSaleResource;
use App\Http\Resources\SaleResource;
use App\Models\AppNotification;
use App\Models\PreSale;
use App\Models\PreSaleItem;
use App\Models\User;
use App\Services\PreSaleService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;

class PreSalesController extends Controller
{
    public function __construct(private readonly PreSaleService $service) {}

    /**
     * GET /pre-sales
     *
     * Query params: store_id, customer_id, status (live|ready|completed|expired|cancelled|active),
     *               code, from (Y-m-d), to (Y-m-d), per_page
     */
    public function index(Request $request): JsonResponse
    {
        $query = PreSale::with(['customer', 'items', 'payments'])
            ->when($request->filled('store_id'),    fn ($q) => $q->where('store_id',    $request->store_id))
            ->when($request->filled('customer_id'), fn ($q) => $q->where('customer_id', $request->customer_id))
            ->when($request->filled('code'),        fn ($q) => $q->where('code',        $request->code))
            ->when($request->get('status') === 'active', fn ($q) => $q->active())
            ->when(
                $request->filled('status') && $request->get('status') !== 'active',
                fn ($q) => $q->where('status', $request->status)
            )
            ->when($request->filled('from'), fn ($q) => $q->whereDate('created_at', '>=', $request->from))
            ->when($request->filled('to'),   fn ($q) => $q->whereDate('created_at', '<=', $request->to))
            ->latest();

        $perPage = min((int) ($request->per_page ?? 25), 100);
        $results = $query->paginate($perPage);

        return $this->success([
            'data'       => PreSaleResource::collection($results->items()),
            'pagination' => [
                'total'        => $results->total(),
                'per_page'     => $results->perPage(),
                'current_page' => $results->currentPage(),
                'last_page'    => $results->lastPage(),
            ],
        ]);
    }

    /**
     * POST /pre-sales
     * Creates a PreSale and reserves inventory.
     */
    public function store(StorePreSaleRequest $request): JsonResponse
    {
        try {
            $preSale = $this->service->create(
                data: $request->only([
                    'store_id', 'customer_id', 'product_name', 'status',
                    'advance_payment', 'preorder_limit', 'reserved_quantity',
                    'pickup_deadline', 'cost', 'margin_percent',
                    'category_id', 'supplier_id',
                    'price_1', 'price_2', 'price_3', 'price_4', 'price_5',
                ]),
                itemsData: $request->input('items', []),
                userId: $request->user()->id,
            );
        } catch (\DomainException $e) {
            return $this->error($e->getMessage(), 422);
        }

        return $this->success(new PreSaleResource($preSale), 'Preventa creada.', 201);
    }

    /**
     * GET /pre-sales/{preSale}
     */
    public function show(PreSale $preSale): JsonResponse
    {
        $preSale->load(['items.product', 'payments.paymentMethod', 'logs', 'customer']);

        return $this->success(new PreSaleResource($preSale));
    }

    /**
     * DELETE /pre-sales/{preSale}
     * Solo se permite eliminar preventas en estado live o cancelled.
     */
    public function destroy(PreSale $preSale): JsonResponse
    {
        if (!in_array($preSale->status, ['live', 'paused', 'cancelled'])) {
            return $this->error('Solo se pueden eliminar preventas abiertas, pausadas o canceladas.', 422);
        }

        $preSale->delete();

        return $this->success(null, 'Preventa eliminada.');
    }

    /**
     * PUT /pre-sales/{preSale}
     * Updates editable header fields (not items — items affect inventory).
     */
    public function update(UpdatePreSaleRequest $request, PreSale $preSale): JsonResponse
    {
        try {
            $preSale = $this->service->update(
                $preSale,
                $request->only([
                    'customer_id', 'product_name', 'status', 'advance_payment',
                    'preorder_limit', 'reserved_quantity', 'pickup_deadline',
                    'cost', 'margin_percent',
                    'category_id', 'supplier_id',
                    'price_1', 'price_2', 'price_3', 'price_4', 'price_5',
                ]),
                $request->user()->id,
            );
        } catch (\DomainException $e) {
            return $this->error($e->getMessage(), 422);
        }

        return $this->success(new PreSaleResource($preSale), 'Preventa actualizada.');
    }

    /**
     * PATCH /pre-sales/{preSale}/status
     *
     * Routes all status transitions through the service:
     *   live  ↔ ready  → changeStatus()
     *   completed      → complete() → returns SaleResource
     *   cancelled      → cancel()
     */
    public function updateStatus(UpdatePreSaleStatusRequest $request, PreSale $preSale): JsonResponse
    {
        $newStatus = $request->status;
        $userId    = $request->user()->id;
        $notes     = $request->input('notes');

        try {
            if ($newStatus === PreSale::STATUS_COMPLETED) {
                $sale = $this->service->complete($preSale, $userId);

                return $this->success(new SaleResource($sale), 'Preventa completada. Venta generada.');
            }

            if ($newStatus === PreSale::STATUS_CANCELLED) {
                $preSale = $this->service->cancel($preSale, $userId, $notes);

                return $this->success(new PreSaleResource($preSale), 'Preventa cancelada. Inventario liberado.');
            }

            $preSale = $this->service->changeStatus($preSale, $newStatus, $userId, $notes);
        } catch (\DomainException $e) {
            return $this->error($e->getMessage(), 422);
        }

        return $this->success(new PreSaleResource($preSale), "Estado actualizado a '{$newStatus}'.");
    }

    /**
     * POST /pre-sales/{preSale}/payments
     * Records an advance payment (abono).
     */
    public function addPayment(StorePreSalePaymentRequest $request, PreSale $preSale): JsonResponse
    {
        try {
            $payment = $this->service->addPayment(
                $preSale,
                $request->only(['amount', 'payment_method_id', 'notes']),
                $request->user()->id,
            );
        } catch (\DomainException $e) {
            return $this->error($e->getMessage(), 422);
        }

        // Reload for updated balance
        $preSale->load('items', 'payments');

        return $this->success([
            'payment'     => new PreSalePaymentResource($payment),
            'paid_amount' => $preSale->paid_amount,
            'balance'     => $preSale->balance,
        ], 'Abono registrado.', 201);
    }

    /**
     * GET /pre-sales/{preSale}/payments
     * Returns all payments with running totals.
     */
    public function payments(PreSale $preSale): JsonResponse
    {
        $preSale->load(['items', 'payments.paymentMethod']);

        return $this->success([
            'payments'    => PreSalePaymentResource::collection($preSale->payments),
            'total'       => $preSale->total,
            'paid_amount' => $preSale->paid_amount,
            'balance'     => $preSale->balance,
        ]);
    }

    /**
     * PATCH /pre-sales/{preSale}/assign-inventory
     *
     * Admin marks product arrival, assigns quantities per store, sets pickup deadline.
     * Transitions status live → ready and fans out notifications to cashiers.
     */
    public function assignInventory(Request $request, PreSale $preSale): JsonResponse
    {
        $data = $request->validate([
            'quantities'               => ['required', 'array', 'min:1'],
            'quantities.*.store_id'    => ['required', 'integer', 'exists:stores,id'],
            'quantities.*.quantity'    => ['required', 'integer', 'min:1'],
            'pickup_deadline'          => ['required', 'date', 'after_or_equal:today'],
            'arrival_date'             => ['nullable', 'date'],
        ]);

        if (! in_array($preSale->status, PreSale::ACTIVE_STATUSES)) {
            return $this->error(
                "La preventa #{$preSale->id} no puede actualizarse (estado: {$preSale->status}).", 422
            );
        }

        $preSale->update([
            'pickup_deadline' => $data['pickup_deadline'],
            'arrival_date'    => $data['arrival_date'] ?? now()->toDateString(),
            'status'          => PreSale::STATUS_READY,
        ]);

        // Notify cashiers in the affected stores
        $storeIds = collect($data['quantities'])->pluck('store_id')->unique()->all();

        $cashierIds = User::whereIn('store_id', $storeIds)->pluck('id');

        $notifications = $cashierIds->map(fn ($uid) => [
            'user_id'      => $uid,
            'type'         => 'presale_ready',
            'reference_id' => $preSale->id,
            'message'      => "Producto listo para reclamar: {$preSale->product_name} (#{$preSale->code}). Fecha límite: {$preSale->pickup_deadline}.",
            'read_at'      => null,
            'created_at'   => now(),
        ])->all();

        if ($notifications) {
            AppNotification::insert($notifications);
        }

        $preSale->load(['items.product', 'payments.paymentMethod', 'logs', 'customer']);

        return $this->success(
            new PreSaleResource($preSale),
            "Inventario asignado. {$preSale->product_name} listo para recoger."
        );
    }

    /**
     * POST /pre-sales/{preSale}/create-product
     *
     * Admin creates a real Product + stock from pre-sale data.
     * Requires: sku, price_1, warehouse_quantities[].
     */
    public function createProductFromPreSale(Request $request, PreSale $preSale): JsonResponse
    {
        $data = $request->validate([
            'sku'                             => ['required', 'string', 'max:100', 'unique:products,sku'],
            'name'                            => ['nullable', 'string', 'max:255'],
            'cost'                            => ['nullable', 'numeric', 'min:0'],
            'category_id'                     => ['nullable', 'integer', 'exists:product_categories,id'],
            'price_1'                         => ['required', 'numeric', 'min:0'],
            'price_2'                         => ['nullable', 'numeric', 'min:0'],
            'price_3'                         => ['nullable', 'numeric', 'min:0'],
            'price_4'                         => ['nullable', 'numeric', 'min:0'],
            'price_5'                         => ['nullable', 'numeric', 'min:0'],
            'warehouse_quantities'            => ['required', 'array', 'min:1'],
            'warehouse_quantities.*.warehouse_id' => ['required', 'integer', 'exists:warehouses,id'],
            'warehouse_quantities.*.quantity' => ['required', 'integer', 'min:0'],
        ]);

        if ($preSale->inventory_pushed) {
            return $this->error("El producto ya fue dado de alta para esta preventa.", 422);
        }

        try {
            $result = $this->service->createProductFromPreSale(
                $preSale,
                $data,
                $request->user()->id
            );
        } catch (\DomainException $e) {
            return $this->error($e->getMessage(), 422);
        }

        return $this->success(
            ['pre_sale' => new PreSaleResource($result['pre_sale']), 'product_id' => $result['product_id']],
            'Producto creado y stock registrado.',
            201
        );
    }

    /**
     * POST /pre-sales/{preSale}/image/upload
     * Sube una imagen de portada para la preventa (sin producto asociado).
     */
    public function uploadImage(Request $request, PreSale $preSale): JsonResponse
    {
        $request->validate([
            'image' => ['required', 'file', 'image', 'max:5120'],
        ]);

        // Remove old image if present
        if ($preSale->image_path) {
            Storage::delete($preSale->image_path);
        }

        $path = $request->file('image')->store("pre-sales/{$preSale->id}");

        $preSale->update(['image_path' => $path]);

        return $this->success([
            'image_path' => $path,
            'url'        => Storage::url($path),
        ], 'Imagen subida.', 201);
    }

    /**
     * PATCH /pre-sales/{preSale}/expire-to-inventory
     *
     * Admin expires an unclaimed pre-sale and moves reserved stock to real inventory.
     */
    public function expireToInventory(Request $request, PreSale $preSale): JsonResponse
    {
        $data = $request->validate([
            'warehouse_id' => ['required', 'integer', 'exists:warehouses,id'],
        ]);

        if (! in_array($preSale->status, PreSale::ACTIVE_STATUSES)) {
            return $this->error(
                "La preventa #{$preSale->id} no puede expirarse (estado: {$preSale->status}).", 422
            );
        }

        try {
            $preSale = $this->service->expireToInventory($preSale, $data['warehouse_id'], $request->user()->id);
        } catch (\DomainException $e) {
            return $this->error($e->getMessage(), 422);
        }

        return $this->success(
            new PreSaleResource($preSale),
            'Preventa expirada. Stock movido a inventario real.'
        );
    }

    /**
     * PATCH /pre-sales/{preSale}/items/{item}/deliver
     *
     * Marks a single pre-sale item as delivered (or resets it to pending).
     */
    public function deliverItem(Request $request, PreSale $preSale, PreSaleItem $item): JsonResponse
    {
        if ($item->pre_sale_id !== $preSale->id) {
            return $this->error('El item no pertenece a esta preventa.', 422);
        }

        $data = $request->validate([
            'status' => ['required', 'in:pending,delivered'],
        ]);

        $item->update(['status' => $data['status']]);

        return $this->success([
            'id'     => $item->id,
            'status' => $item->status,
        ]);
    }
}
