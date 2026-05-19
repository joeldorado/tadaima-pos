<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\CheckoutRequest;
use App\Http\Resources\SaleResource;
use App\Models\Inventory;
use App\Models\InventoryMovement;
use App\Models\Sale;
use App\Services\CheckoutService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class SalesController extends Controller
{
    public function __construct(private readonly CheckoutService $checkoutService) {}

    /**
     * GET /sales
     * Filters: store_id, from (Y-m-d), to (Y-m-d), status, per_page
     */
    public function index(Request $request): JsonResponse
    {
        $query = Sale::with(['customer', 'payments.paymentMethod', 'items.product'])
            ->when($request->store_id, fn ($q) => $q->where('store_id', $request->store_id))
            ->when($request->status,   fn ($q) => $q->where('status', $request->status))
            ->when($request->from,     fn ($q) => $q->whereDate('sold_at', '>=', $request->from))
            ->when($request->to,       fn ($q) => $q->whereDate('sold_at', '<=', $request->to))
            ->latest('sold_at');

        $perPage = min((int) ($request->per_page ?? 25), 100);
        $sales   = $query->paginate($perPage);

        return $this->success([
            'data'       => SaleResource::collection($sales->items()),
            'pagination' => [
                'total'        => $sales->total(),
                'per_page'     => $sales->perPage(),
                'current_page' => $sales->currentPage(),
                'last_page'    => $sales->lastPage(),
            ],
        ]);
    }

    /**
     * GET /sales/{id}
     */
    public function show(Sale $sale): JsonResponse
    {
        $sale->load(['items.product', 'payments.paymentMethod', 'customer']);

        return $this->success(new SaleResource($sale));
    }

    /**
     * POST /sales  — checkout.
     *
     * Soporta dos modos:
     *   A) Legacy: {draft_id, payments, discount} — convierte draft existente en venta.
     *   B) Direct (client-authoritative cart, ADR-014): {items, store_id,
     *      register_session_id, customer_id?, payments, discount} — crea draft+items
     *      y la venta en una sola transacción. Usado cuando el carrito vive solo
     *      en frontend hasta el cobro.
     */
    public function store(CheckoutRequest $request): JsonResponse
    {
        try {
            if ($request->has('items')) {
                $sale = $this->checkoutService->checkoutDirect(
                    storeId:           (int) $request->input('store_id'),
                    registerSessionId: (int) $request->input('register_session_id'),
                    customerId:        $request->input('customer_id') ? (int) $request->input('customer_id') : null,
                    items:             $request->input('items'),
                    paymentsData:      $request->input('payments'),
                    discount:          (float) ($request->input('discount', 0)),
                    userId:            $request->user()->id,
                );
            } else {
                $sale = $this->checkoutService->checkout(
                    draftId:      $request->integer('draft_id'),
                    paymentsData: $request->input('payments'),
                    discount:     (float) ($request->input('discount', 0)),
                    userId:       $request->user()->id,
                );
            }
        } catch (\DomainException $e) {
            return $this->error($e->getMessage(), 422);
        }

        return $this->success(new SaleResource($sale), 'Venta registrada correctamente.', 201);
    }

    /**
     * POST /sales/{sale}/return
     * Marca la venta como devuelta y restaura el inventario.
     */
    public function return(Sale $sale, Request $request): JsonResponse
    {
        if ($sale->status !== Sale::STATUS_COMPLETED) {
            return $this->error('La venta no puede ser devuelta en su estado actual.', 422);
        }

        DB::transaction(function () use ($sale, $request): void {
            $sale->update(['status' => Sale::STATUS_RETURNED]);

            $sale->load('items');

            foreach ($sale->items as $item) {
                // Busca el inventario del producto en la bodega de la tienda de la venta
                $inventory = Inventory::query()
                    ->where('product_id', $item->product_id)
                    ->whereHas('warehouse', fn ($q) => $q->where('store_id', $sale->store_id))
                    ->lockForUpdate()
                    ->first();

                if ($inventory) {
                    $inventory->increment('quantity', $item->quantity);
                }

                InventoryMovement::create([
                    'product_id'   => $item->product_id,
                    'warehouse_id' => $inventory?->warehouse_id,
                    'type'         => 'devolucion',
                    'quantity'     => $item->quantity,
                    'reference'    => "Devolución venta #{$sale->id}",
                    'user_id'      => $request->user()?->id,
                ]);
            }
        });

        $sale->load(['items.product', 'payments.paymentMethod', 'customer']);

        return $this->success(new SaleResource($sale), 'Devolución registrada correctamente.');
    }
}
