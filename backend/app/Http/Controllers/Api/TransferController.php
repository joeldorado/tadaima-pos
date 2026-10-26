<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreTransferRequest;
use App\Http\Resources\TransferResource;
use App\Models\Transfer;
use App\Models\User;
use App\Models\Warehouse;
use App\Services\TransferService;
use App\Support\DateRange;
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

    private function isManagerUser(?User $user): bool
    {
        return $user !== null && $user->hasRole(['gerente', 'manager']);
    }

    /** Aplica el scope al query de transferencias para usuarios no-admin. */
    private function scopeToUserStore($query, ?User $user): void
    {
        if ($this->isAdminUser($user)) {
            return;
        }
        $userId  = $user?->id;
        $storeId = $user?->store_id;
        if (! $userId) {
            $query->whereRaw('1=0');
            return;
        }
        // Ve el traslado si: su tienda es origen/destino, O él lo creó.
        $query->where(function ($q) use ($storeId, $userId) {
            $q->where('user_id', $userId);
            if ($storeId) {
                $q->orWhereHas('fromWarehouse', fn ($w) => $w->where('store_id', $storeId))
                  ->orWhereHas('toWarehouse',   fn ($w) => $w->where('store_id', $storeId));
            }
        });
    }

    /** True si el usuario puede ver/actuar sobre la transferencia indicada. */
    private function canAccessTransfer(Transfer $transfer, ?User $user): bool
    {
        if ($this->isAdminUser($user)) {
            return true;
        }
        if (! $user) {
            return false;
        }
        // El gerente que la creó siempre tiene acceso.
        if ((int) $transfer->user_id === (int) $user->id) {
            return true;
        }
        // También el gerente cuya tienda es origen o destino.
        $storeId = $user->store_id;
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
        $query = Transfer::with(['fromWarehouse', 'toWarehouse', 'user', 'items.product.images'])
            ->when($request->filled('from_warehouse_id'), fn ($q) => $q->where('from_warehouse_id', $request->from_warehouse_id))
            ->when($request->filled('to_warehouse_id'),   fn ($q) => $q->where('to_warehouse_id',   $request->to_warehouse_id))
            ->when($request->filled('status'),             fn ($q) => $q->where('status',             $request->status))
            ->when($request->filled('from'),               fn ($q) => $q->where('created_at', '>=', DateRange::fromUtc((string) $request->from)))
            ->when($request->filled('to'),                 fn ($q) => $q->where('created_at', '<=', DateRange::toUtc((string) $request->to)))
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
        // RBAC — flujo 2026-06-11 (alineado a la UI de Ruben):
        // - Solo admin y gerente crean traslados (cajero fuera).
        // - El gerente SOLICITA viendo stock de todas las tiendas: puede usar
        //   cualquier bodega ORIGEN, pero su tienda debe ser origen o destino
        //   (típico: pedir stock de otra sucursal hacia la suya). Solo admin
        //   completa el traslado, así que la solicitud queda pending.
        $user = $request->user();
        if (! $this->isAdminUser($user)) {
            if (! $this->isManagerUser($user)) {
                return $this->error('Solo admin o gerente pueden crear traslados.', 403);
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
        $transfer->load(['items.product.images', 'fromWarehouse', 'toWarehouse', 'user']);

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

        $transfer->load('items.product.images');

        return $this->success(\App\Http\Resources\TransferItemResource::collection($transfer->items));
    }

    /**
     * PUT /transfers/{transfer}/complete — "Recibir".
     * Ejecuta el traslado: mueve inventario de bodega origen a destino.
     * Falla si algún producto no tiene stock suficiente en origen.
     *
     * Quién puede completar (2026-10-26): admin siempre; el gerente que creó el
     * traslado; o el gerente de la tienda ORIGEN o DESTINO.
     */
    public function complete(Transfer $transfer): JsonResponse
    {
        $user = request()->user();

        if (! $this->isAdminUser($user)) {
            if (! $this->isManagerUser($user) || ! $this->canAccessTransfer($transfer, $user)) {
                return $this->error('Solo admin o el gerente de la tienda origen o destino pueden completar este traslado.', 403);
            }
        }

        try {
            $transfer = $this->service->complete($transfer, request()->user()->id);
        } catch (\DomainException $e) {
            return $this->error($e->getMessage(), 422);
        }

        return $this->success(new TransferResource($transfer), 'Traslado recibido. Inventario actualizado.');
    }

    /**
     * PUT /transfers/{transfer}/cancel
     * Cancela el traslado (solo si está pending).
     */
    public function cancel(Transfer $transfer): JsonResponse
    {
        $user = request()->user();

        if (! $this->canAccessTransfer($transfer, $user)) {
            return $this->error('No tienes acceso a este traslado.', 403);
        }

        // Flujo 2026-06-11: cancela admin o el gerente que CREÓ la solicitud.
        $isCreatorManager = $this->isManagerUser($user)
            && (int) $transfer->user_id === (int) ($user?->id ?? 0);
        if (! $this->isAdminUser($user) && ! $isCreatorManager) {
            return $this->error('Solo admin o el gerente creador pueden cancelar este traslado.', 403);
        }

        try {
            $transfer = $this->service->cancel($transfer);
        } catch (\DomainException $e) {
            return $this->error($e->getMessage(), 422);
        }

        return $this->success(new TransferResource($transfer), 'Traslado cancelado.');
    }
}
