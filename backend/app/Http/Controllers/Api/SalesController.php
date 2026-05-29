<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\CheckoutRequest;
use App\Http\Resources\SaleResource;
use App\Models\Inventory;
use App\Models\InventoryMovement;
use App\Models\Sale;
use App\Models\SaleCancellation;
use App\Services\CheckoutService;
use App\Services\SaleCancellationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class SalesController extends Controller
{
    public function __construct(private readonly CheckoutService $checkoutService) {}

    /**
     * GET /sales
     * Filters: store_id, user_id, from (Y-m-d), to (Y-m-d), status, per_page
     *
     * RBAC:
     *  - admin: ve todo, puede filtrar libremente
     *  - gerente: scoping a su tienda (ignora store_id del request si difiere)
     *  - cajero: scoping a su tienda Y a su propio user_id (ignora filtros que
     *    intenten ver otras ventas)
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $isAdmin = $user && $user->hasRole(['admin', 'super_admin', 'owner', 'dueño']);
        $isCashier = $user && $user->hasRole(['cajero']) && ! $isAdmin;

        // Las fechas del frontend vienen en hora LOCAL del usuario (MX). El
        // sold_at se guarda en UTC. whereDate compara fechas en UTC sin
        // conversión, así que una venta del 21-may 19:00 MX (= 01:00 UTC del
        // 22-may) NO matchea con filter "Hoy" del cajero. DateRange convierte
        // el rango MX → UTC explícitamente.
        $fromUtc = \App\Support\DateRange::fromUtc($request->from);
        $toUtc = \App\Support\DateRange::toUtc($request->to);

        $query = Sale::with([
                'customer', 'payments.paymentMethod', 'items.product', 'user:id,name',
                // Preventas creadas en el mismo ticket (cobro mixto). Sin esto
                // el frontend separa el ticket de la nueva preventa como si
                // fueran ventas distintas.
                'preSaleOrders.items.catalog:id,product_name',
            ])
            ->when($request->user_id, fn ($q) => $q->where('user_id', $request->user_id))
            ->when($request->status,  fn ($q) => $q->where('status', $request->status))
            ->when($fromUtc, fn ($q) => $q->where('sold_at', '>=', $fromUtc))
            ->when($toUtc,   fn ($q) => $q->where('sold_at', '<=', $toUtc))
            ->latest('sold_at');

        // Scope por rol — no permitir que un cajero/gerente vea más de lo suyo.
        if (! $isAdmin) {
            $storeId = $user?->store_id;
            if (! $storeId) {
                $query->whereRaw('1=0');
            } else {
                $query->where('store_id', $storeId);
            }
            if ($isCashier) {
                // Cajero solo ve sus propias ventas — incluso si el frontend
                // intentó pasar un user_id distinto, se sobreescribe.
                $query->where('user_id', $user->id);
            }
        } else {
            // Admin: filtra por store_id si lo pide.
            $query->when($request->store_id, fn ($q) => $q->where('store_id', $request->store_id));
        }

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
        $sale->load([
            'items.product', 'payments.paymentMethod', 'customer', 'user:id,name',
            'preSaleOrders.items.catalog:id,product_name',
        ]);

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

    /**
     * POST /sales/{sale}/cancel — ADR-016.
     *
     * Body: {
     *   items?:        [{sale_item_id: int, quantity: number}]   ← vacío/omitido = cancelación total
     *   reason_code:   'cliente_devuelve'|'error_cajero'|'dañado'|'no_llego'|'otro'
     *   reason_text?:  string
     *   cash_session_id?: int   ← sesión activa donde se registra la salida
     * }
     */
    public function cancel(Sale $sale, Request $request, SaleCancellationService $service): JsonResponse
    {
        $data = $request->validate([
            'items'              => ['nullable', 'array'],
            'items.*.sale_item_id' => ['required_with:items', 'integer'],
            'items.*.quantity'   => ['required_with:items', 'numeric', 'min:0.01'],
            'reason_code'        => ['required', 'string', 'in:cliente_devuelve,error_cajero,dañado,no_llego,otro'],
            'reason_text'        => ['nullable', 'string', 'max:500'],
            'cash_session_id'    => ['nullable', 'integer', 'exists:cash_register_sessions,id'],
        ]);

        try {
            $cancellation = $service->cancelSale(
                sale: $sale,
                itemsToCancel: $data['items'] ?? [],
                reasonCode: $data['reason_code'],
                reasonText: $data['reason_text'] ?? null,
                cancelledBy: $request->user(),
                activeSessionId: $data['cash_session_id'] ?? null,
            );
        } catch (\DomainException $e) {
            return $this->error($e->getMessage(), 422);
        }

        $sale->refresh()->load(['items.product', 'payments.paymentMethod', 'customer']);
        return $this->success([
            'sale'         => new SaleResource($sale),
            'cancellation' => [
                'id'              => $cancellation->id,
                'mode'            => $cancellation->mode,
                'amount_refunded' => (float) $cancellation->amount_refunded,
                'cash_movement_id'=> $cancellation->cash_movement_id,
            ],
        ], 'Cancelación registrada correctamente.');
    }
}
