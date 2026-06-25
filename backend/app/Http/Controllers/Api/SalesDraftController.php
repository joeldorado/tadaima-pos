<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreSalesDraftItemRequest;
use App\Http\Requests\StoreSalesDraftRequest;
use App\Http\Requests\UpdateSalesDraftItemRequest;
use App\Http\Resources\SalesDraftResource;
use App\Models\Inventory;
use App\Models\SalesDraft;
use App\Models\SalesDraftItem;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;

class SalesDraftController extends Controller
{
    /**
     * GET /sales-drafts
     *
     * Query params:
     *   ?store_id=       filtrar por tienda
     *   ?user_id=        filtrar por cajero
     *   ?status=open|suspended|all  (default: active = open+suspended)
     */
    public function index(Request $request): JsonResponse
    {
        $user = $request->user();
        $isAdmin = $user && $user->isAdminRole();
        $drafts = SalesDraft::query()
            ->with(['items', 'customer'])
            // Scope cross-tienda: no-admin solo ve drafts de su tienda.
            ->when($isAdmin && $request->filled('store_id'), fn ($q) => $q->where('store_id', $request->store_id))
            ->when(! $isAdmin, function ($q) use ($user) {
                $user->store_id ? $q->where('store_id', $user->store_id) : $q->whereRaw('1=0');
            })
            ->when($request->filled('user_id'),  fn ($q) => $q->where('user_id',  $request->user_id))
            ->when(
                $request->get('status') === 'all',
                fn ($q) => $q,
                fn ($q) => $request->filled('status')
                    ? $q->where('status', $request->status)
                    : $q->active()
            )
            ->latest()
            ->get();

        return $this->success(SalesDraftResource::collection($drafts));
    }

    /**
     * POST /sales-drafts
     *
     * Crea un nuevo draft. Valida que el usuario no supere 5 drafts activos.
     */
    public function store(StoreSalesDraftRequest $request): JsonResponse
    {
        // Guard cross-tienda: solo se inicia venta en la tienda del usuario.
        if ($resp = $this->storeScopeError($request, $request->input('store_id'))) {
            return $resp;
        }

        $userId    = $request->user()->id;
        $openCount = SalesDraft::active()
            ->where('user_id', $userId)
            ->count();

        if ($openCount >= SalesDraft::MAX_OPEN) {
            return $this->error(
                "Límite de " . SalesDraft::MAX_OPEN . " ventas simultáneas alcanzado. Completa o cancela una venta antes de abrir una nueva.",
                422
            );
        }

        $draft = SalesDraft::create([
            'store_id'            => $request->store_id,
            'user_id'             => $userId,
            'customer_id'         => $request->customer_id,
            'register_session_id' => $request->register_session_id,
            'status'              => SalesDraft::STATUS_OPEN,
        ]);

        $draft->load(['items', 'customer']);

        return $this->success(new SalesDraftResource($draft), 'Venta iniciada', 201);
    }

    /**
     * GET /sales-drafts/{draft}
     */
    public function show(Request $request, SalesDraft $salesDraft): JsonResponse
    {
        if ($resp = $this->storeScopeError($request, $salesDraft->store_id)) {
            return $resp;
        }

        $salesDraft->load(['items.product', 'customer', 'store', 'user']);

        return $this->success(new SalesDraftResource($salesDraft));
    }

    /**
     * POST /sales-drafts/{draft}/items
     *
     * Agrega un producto al carrito.
     *
     * Reglas:
     *  - El draft debe estar open o suspended
     *  - Valida stock disponible considerando todos los drafts activos
     *  - Si el producto ya existe en el draft, acumula la cantidad
     *  - Si price no se envía, usa price_1 del catálogo
     */
    public function addItem(StoreSalesDraftItemRequest $request, SalesDraft $salesDraft): JsonResponse
    {
        if (! in_array($salesDraft->status, [SalesDraft::STATUS_OPEN, SalesDraft::STATUS_SUSPENDED])) {
            return $this->error('Solo se pueden agregar ítems a drafts activos.', 422);
        }

        $productId   = $request->product_id;
        $qtyToAdd    = (float) $request->quantity;

        // ── Resolución de precio ──────────────────────────────────────────────
        $price = $this->resolvePrice($request, $productId);
        if ($price === null) {
            return $this->error('El producto no tiene precio configurado (price_1). Envía el precio manualmente.', 422);
        }

        // ── Validación de stock ───────────────────────────────────────────────
        [$available, $error] = $this->checkStock($productId, $salesDraft->id, $qtyToAdd);
        if ($error) {
            return $this->error($error, 422);
        }

        // ── Acumular si el producto ya existe en el draft ─────────────────────
        $existingItem = $salesDraft->items()->where('product_id', $productId)->first();

        if ($existingItem) {
            $existingItem->update([
                'quantity' => $existingItem->quantity + $qtyToAdd,
                'price'    => $price,               // actualiza al precio más reciente
            ]);
            $item = $existingItem->fresh()->load('product');
        } else {
            $item = $salesDraft->items()->create([
                'product_id' => $productId,
                'quantity'   => $qtyToAdd,
                'price'      => $price,
                'total'      => 0, // se recalcula en el modelo booted()
            ]);
            $item->load('product');
        }

        $salesDraft->load('items');

        return $this->success([
            'item'     => new \App\Http\Resources\SalesDraftItemResource($item),
            'subtotal' => $salesDraft->subtotal,
        ], 'Producto agregado', 201);
    }

    /**
     * PUT /sales-drafts/{draft}/items/{item}
     *
     * Actualiza cantidad (y opcionalmente precio) de un ítem.
     * Valida que la nueva cantidad no supere el stock disponible.
     */
    public function updateItem(
        UpdateSalesDraftItemRequest $request,
        SalesDraft $salesDraft,
        SalesDraftItem $salesDraftItem
    ): JsonResponse {
        if ($salesDraftItem->draft_id !== $salesDraft->id) {
            return $this->error('El ítem no pertenece a este draft.', 403);
        }

        $productId  = $salesDraftItem->product_id;
        $newQty     = (float) $request->quantity;
        $deltaQty   = $newQty - $salesDraftItem->quantity; // diferencia respecto al actual

        if ($deltaQty > 0) {
            // Solo validar si se incrementa la cantidad
            [, $error] = $this->checkStock($productId, $salesDraft->id, $deltaQty, $salesDraftItem->id);
            if ($error) {
                return $this->error($error, 422);
            }
        }

        $data = ['quantity' => $newQty];
        if ($request->filled('price')) {
            $data['price'] = (float) $request->price;
        }

        $salesDraftItem->update($data);
        $salesDraft->load('items');

        return $this->success([
            'item'     => new \App\Http\Resources\SalesDraftItemResource($salesDraftItem->fresh()->load('product')),
            'subtotal' => $salesDraft->subtotal,
        ], 'Ítem actualizado');
    }

    /**
     * DELETE /sales-drafts/{draft}/items/{item}
     */
    public function removeItem(SalesDraft $salesDraft, SalesDraftItem $salesDraftItem): JsonResponse
    {
        if ($salesDraftItem->draft_id !== $salesDraft->id) {
            return $this->error('El ítem no pertenece a este draft.', 403);
        }

        $salesDraftItem->delete();
        $salesDraft->load('items');

        return $this->success([
            'subtotal' => $salesDraft->subtotal,
        ], 'Ítem eliminado');
    }

    /**
     * DELETE /sales-drafts/{draft}
     *
     * Cancela el draft (soft-cancel: status = cancelled, no borra el registro).
     */
    public function cancel(Request $request, SalesDraft $salesDraft): JsonResponse
    {
        if ($resp = $this->storeScopeError($request, $salesDraft->store_id)) {
            return $resp;
        }
        if ($salesDraft->status === SalesDraft::STATUS_COMPLETED) {
            return $this->error('No se puede cancelar una venta ya completada.', 422);
        }

        $salesDraft->update(['status' => SalesDraft::STATUS_CANCELLED]);

        return $this->success(null, 'Venta cancelada');
    }

    /**
     * GET /sales-drafts/reserved-stock?store_id=X
     *
     * Devuelve el mapa { product_id: cantidad_reservada } para todos los drafts
     * open de la tienda. Cacheado 3s para soportar polling de múltiples cajas
     * sin pegar a MySQL en cada request.
     */
    public function reservedStock(Request $request): JsonResponse
    {
        $storeId = (int) $request->query('store_id');
        if ($storeId <= 0) {
            return $this->error('store_id es requerido.', 422);
        }

        $map = Cache::remember(
            "drafts:reserved-stock:store:{$storeId}",
            3,
            fn () => DB::table('sales_draft_items as sdi')
                ->join('sales_drafts as sd', 'sd.id', '=', 'sdi.draft_id')
                ->where('sd.store_id', $storeId)
                ->where('sd.status', SalesDraft::STATUS_OPEN)
                ->groupBy('sdi.product_id')
                ->selectRaw('sdi.product_id, SUM(sdi.quantity) as reserved')
                ->pluck('reserved', 'product_id')
                ->map(fn ($v) => (float) $v)
                ->toArray()
        );

        return $this->success([
            'reservations' => $map,
            'as_of'        => now()->toIso8601String(),
        ]);
    }

    /**
     * GET /sales-drafts/expiring
     *
     * Lista los drafts del usuario actual que ya fueron marcados como "por vencer".
     * El frontend lee esto cada 20s y dispara modal top-priority cuando hay resultados.
     * Incluye `seconds_remaining` para countdown UI.
     */
    public function expiring(Request $request): JsonResponse
    {
        $userId = $request->user()->id;
        $graceCutoff = now()->subMinutes(SalesDraft::WARNING_GRACE_MINUTES);

        $drafts = SalesDraft::query()
            ->with(['items.product', 'customer', 'store'])
            ->where('user_id', $userId)
            ->where('status', SalesDraft::STATUS_OPEN)
            ->whereNotNull('warned_at')
            ->where('warned_at', '>', $graceCutoff)  // aún en grace, no canceladas todavía
            ->whereHas('items')
            ->get()
            ->map(function (SalesDraft $d) {
                $expiresAt = $d->warned_at->addMinutes(SalesDraft::WARNING_GRACE_MINUTES);
                return [
                    'id'                  => $d->id,
                    'store_id'            => $d->store_id,
                    'store_name'          => $d->store?->name,
                    'customer_name'       => $d->customer?->name,
                    'subtotal'            => $d->subtotal,
                    'item_count'          => $d->items->sum('quantity'),
                    'warned_at'           => $d->warned_at->toIso8601String(),
                    'cancels_at'          => $expiresAt->toIso8601String(),
                    'seconds_remaining'   => max(0, (int) now()->diffInSeconds($expiresAt, false)),
                ];
            });

        return $this->success($drafts);
    }

    /**
     * POST /sales-drafts/{draft}/extend
     *
     * Resetea el reloj del draft: expires_at = now() + EXPIRE_MINUTES y warned_at = null.
     * Llamado desde el modal "Mantener carrito" cuando el cajero confirma que sigue activo.
     */
    public function extend(SalesDraft $salesDraft): JsonResponse
    {
        if ($salesDraft->status !== SalesDraft::STATUS_OPEN) {
            return $this->error('Solo se pueden extender ventas abiertas.', 422);
        }

        $salesDraft->update([
            'expires_at' => now()->addMinutes(SalesDraft::EXPIRE_MINUTES),
            'warned_at'  => null,
        ]);

        return $this->success([
            'id'         => $salesDraft->id,
            'expires_at' => $salesDraft->fresh()->expires_at?->toIso8601String(),
        ], 'Carrito mantenido');
    }

    // ─── Private helpers ──────────────────────────────────────────────────────

    /**
     * Resuelve el precio del producto.
     * Usa el enviado en el request o cae a price_1 del catálogo.
     */
    private function resolvePrice(Request $request, int $productId): ?float
    {
        if ($request->filled('price')) {
            return (float) $request->price;
        }

        $price = \App\Models\ProductPrice::where('product_id', $productId)->value('price_1');

        return $price !== null ? (float) $price : null;
    }

    /**
     * Valida que hay suficiente stock para agregar $qtyRequested unidades de $productId.
     *
     * Considera:
     *   - Stock físico total (suma de todos los almacenes)
     *   - Unidades ya reservadas en TODOS los drafts activos
     *   - Excluye el ítem actual (para updates)
     *
     * @return array{float, ?string}  [stockDisponible, mensajeError|null]
     */
    private function checkStock(
        int $productId,
        int $currentDraftId,
        float $qtyRequested,
        int $excludeItemId = 0
    ): array {
        // Stock + reservas SCOPED al store del draft. Sin scoping, un cajero
        // podía apartar más unidades de las que físicamente existen en su tienda
        // (porque sumaba inventario de otras tiendas) y al cobrar la validación
        // de reserveStock lo rechazaba — pero ya tarde, con UI desincronizada.
        $draft = SalesDraft::find($currentDraftId);
        $storeId = $draft?->store_id;

        $totalStock = (float) Inventory::query()
            ->where('product_id', $productId)
            ->when($storeId, fn ($q) => $q->whereHas('warehouse', fn ($w) =>
                $w->where('store_id', $storeId)->where('active', true)
            ))
            ->sum('quantity');

        $reservedInDrafts = (float) SalesDraftItem::query()
            ->where('product_id', $productId)
            ->when($excludeItemId, fn ($q) => $q->where('id', '!=', $excludeItemId))
            ->whereHas('draft', fn ($q) => $q->active()
                ->when($storeId, fn ($s) => $s->where('store_id', $storeId))
            )
            ->sum('quantity');

        $available = $totalStock - $reservedInDrafts;

        if ($qtyRequested > $available) {
            return [
                $available,
                "Stock insuficiente. Disponible: {$available}, solicitado: {$qtyRequested}.",
            ];
        }

        return [$available, null];
    }
}
