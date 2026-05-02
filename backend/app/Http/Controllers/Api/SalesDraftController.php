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
        $drafts = SalesDraft::query()
            ->with(['items', 'customer'])
            ->when($request->filled('store_id'), fn ($q) => $q->where('store_id', $request->store_id))
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
    public function show(SalesDraft $salesDraft): JsonResponse
    {
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
    public function cancel(SalesDraft $salesDraft): JsonResponse
    {
        if ($salesDraft->status === SalesDraft::STATUS_COMPLETED) {
            return $this->error('No se puede cancelar una venta ya completada.', 422);
        }

        $salesDraft->update(['status' => SalesDraft::STATUS_CANCELLED]);

        return $this->success(null, 'Venta cancelada');
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
        $totalStock = (float) Inventory::where('product_id', $productId)->sum('quantity');

        $reservedInDrafts = (float) SalesDraftItem::query()
            ->where('product_id', $productId)
            ->when($excludeItemId, fn ($q) => $q->where('id', '!=', $excludeItemId))
            ->whereHas('draft', fn ($q) => $q->active())
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
