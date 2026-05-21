<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreTransferRequest;
use App\Http\Resources\TransferResource;
use App\Models\Transfer;
use App\Models\User;
use App\Models\Warehouse;
use App\Services\TransferService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class TransferController extends Controller
{
    public function __construct(private readonly TransferService $service) {}

    private const ADMIN_ROLES = ['admin', 'super_admin', 'owner', 'dueño'];

    /** Admin (cualquier variante) ve todas las tiendas; el resto sólo la suya. */
    private function isAdminUser(?User $user): bool
    {
        return $user !== null && $user->hasRole(self::ADMIN_ROLES);
    }

    /** Aplica el scope por tienda al query de transferencias para usuarios no-admin. */
    private function scopeToUserStore($query, ?User $user): void
    {
        if ($this->isAdminUser($user)) {
            return;
        }
        $storeId = $user?->store_id;
        if (! $storeId) {
            // Usuario no-admin sin tienda asignada → no ve nada.
            $query->whereRaw('1=0');
            return;
        }
        // Una transferencia es "de mi tienda" si la bodega origen O destino
        // pertenece al store_id del usuario.
        $query->where(function ($q) use ($storeId) {
            $q->whereHas('fromWarehouse', fn ($w) => $w->where('store_id', $storeId))
              ->orWhereHas('toWarehouse',   fn ($w) => $w->where('store_id', $storeId));
        });
    }

    /** True si el usuario (no-admin) tiene visibilidad sobre la transferencia indicada. */
    private function canAccessTransfer(Transfer $transfer, ?User $user): bool
    {
        if ($this->isAdminUser($user)) {
            return true;
        }
        $storeId = $user?->store_id;
        if (! $storeId) {
            return false;
        }
        $transfer->loadMissing(['fromWarehouse', 'toWarehouse']);
        return (int) ($transfer->fromWarehouse?->store_id ?? 0) === (int) $storeId
            || (int) ($transfer->toWarehouse?->store_id   ?? 0) === (int) $storeId;
    }

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

        // RBAC por tienda — gerente/cajero solo ven transferencias que tocan su tienda.
        $this->scopeToUserStore($query, $request->user());

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
        // RBAC: el gerente/cajero sólo puede crear traslados cuya bodega origen
        // pertenezca a su propia tienda. Antes podía mandar productos desde
        // cualquier tienda (bug QA Web 5).
        $user = $request->user();
        if (! $this->isAdminUser($user)) {
            $storeId = $user?->store_id;
            $fromWarehouse = Warehouse::find($request->input('from_warehouse_id'));
            if (! $storeId || ! $fromWarehouse || (int) $fromWarehouse->store_id !== (int) $storeId) {
                return $this->error('Solo puedes crear traslados desde la bodega de tu tienda.', 403);
            }
        }

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

        if (! $this->canAccessTransfer($transfer, request()->user())) {
            return $this->error('No tienes acceso a este traslado.', 403);
        }

        return $this->success(new TransferResource($transfer));
    }

    /**
     * GET /transfers/{transfer}/items
     * Alias de show — devuelve solo los ítems.
     */
    public function items(Transfer $transfer): JsonResponse
    {
        if (! $this->canAccessTransfer($transfer, request()->user())) {
            return $this->error('No tienes acceso a este traslado.', 403);
        }

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
        if (! $this->canAccessTransfer($transfer, request()->user())) {
            return $this->error('No tienes acceso a este traslado.', 403);
        }

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
        if (! $this->canAccessTransfer($transfer, request()->user())) {
            return $this->error('No tienes acceso a este traslado.', 403);
        }

        try {
            $transfer = $this->service->cancel($transfer);
        } catch (\DomainException $e) {
            return $this->error($e->getMessage(), 422);
        }

        return $this->success(new TransferResource($transfer), 'Traslado cancelado.');
    }
}
