<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\AssignPromotionProductsRequest;
use App\Http\Requests\StoreProductPromotionRequest;
use App\Models\Product;
use App\Models\ProductPromotion;
use App\Services\PromotionService;
use Illuminate\Http\JsonResponse;

/**
 * Promociones GENERALES (2026-07-25): la promo es una entidad propia — nace en
 * el menú Promos (con o sin productos) y se ASIGNA a 1..N productos. El CRUD
 * anidado /products/{id}/promotions sigue vivo como shim para bundles PWA
 * rezagados (ver ProductPromotionsController).
 *
 * RBAC: mutaciones gated a admin/gerente + can_manage_promos; el gerente solo
 * muta promos de SU tienda (las globales las gestiona el admin). Listar es
 * libre para autenticados (mismo criterio que el shim).
 */
class PromotionsController extends Controller
{
    public function __construct(private readonly PromotionService $promotions)
    {
    }

    /** GET /promotions — todas (gestión: incluye pausadas/vencidas). */
    public function index(): JsonResponse
    {
        // Honestidad lazy (igual que el shim): marca expired las vencidas para
        // que el admin vea el estado real. El motor no depende de esto.
        ProductPromotion::query()
            ->where('status', ProductPromotion::STATUS_ACTIVE)
            ->whereNotNull('ends_at')
            ->where('ends_at', '<', now())
            ->update(['status' => ProductPromotion::STATUS_EXPIRED]);

        return $this->success(
            ProductPromotion::query()
                ->withCount('products')
                ->with('products:products.id,name')
                ->orderByDesc('priority')
                ->orderBy('id')
                ->get()
        );
    }

    /** GET /promotions/{promotion} — detalle + productos asignados. */
    public function show(ProductPromotion $promotion): JsonResponse
    {
        return $this->success(
            $promotion->loadCount('products')->load('products:products.id,name')
        );
    }

    /** POST /promotions — crea la promo general (0 productos es legal). */
    public function store(StoreProductPromotionRequest $request): JsonResponse
    {
        if ($resp = $this->adminOrManagerGateError()) {
            return $resp;
        }
        if ($resp = $this->promoManageError()) {
            return $resp;
        }
        if ($msg = $this->promotions->noPaymentMethodMessage(
            $request->has('allow_cash') ? $request->boolean('allow_cash') : true,
            $request->has('allow_card') ? $request->boolean('allow_card') : true,
        )) {
            return $this->error($msg, 422);
        }

        // Sin productos asignados no hay contra qué validar duplicados/tope —
        // esas reglas corren al ASIGNAR (attachProducts) y al reactivar.
        $promotion = ProductPromotion::create(array_merge(
            $request->only(['name', 'buy_n', 'pay_m', 'min_qty', 'discount_per_unit', 'allow_cash', 'allow_card', 'priority']),
            $this->promotions->vigencyDates($request->input('starts_at'), $request->input('ends_at')),
            [
                'type'     => $request->promoType(),
                'status'   => $request->input('status', ProductPromotion::STATUS_ACTIVE),
                'store_id' => $this->promotions->scopedStoreId($request),
            ],
        ));

        return $this->success($promotion->loadCount('products'), 'Promoción creada.', 201);
    }

    /** PUT /promotions/{promotion} — editar / pausar / reanudar. */
    public function update(StoreProductPromotionRequest $request, ProductPromotion $promotion): JsonResponse
    {
        if ($resp = $this->adminOrManagerGateError()) {
            return $resp;
        }
        if ($resp = $this->promoManageError()) {
            return $resp;
        }
        if ($resp = $this->promoMutationGateError($request, $promotion)) {
            return $resp;
        }

        // Flags efectivos (un PUT parcial conserva lo que la promo ya tenía).
        $promoCash = $request->has('allow_cash') ? $request->boolean('allow_cash') : (bool) $promotion->allow_cash;
        $promoCard = $request->has('allow_card') ? $request->boolean('allow_card') : (bool) $promotion->allow_card;
        if ($msg = $this->promotions->noPaymentMethodMessage($promoCash, $promoCard)) {
            return $this->error($msg, 422);
        }

        $assigned = $promotion->products()->get();

        // El conflicto de pago se revalida en CADA update contra CADA asignado:
        // los flags del producto pueden haber cambiado desde que se creó.
        foreach ($assigned as $product) {
            if ($msg = $this->promotions->paymentConflictMessage($product, $promoCash, $promoCard)) {
                return $this->error($msg, 422);
            }
        }

        // Duplicado/tipo/tope solo al REACTIVAR (pausada/vencida → activa),
        // igual que siempre — pero ahora contra TODOS los productos asignados.
        if ($request->has('status')
            && $request->input('status') === ProductPromotion::STATUS_ACTIVE
            && $promotion->status !== ProductPromotion::STATUS_ACTIVE) {
            $type  = $request->has('type') ? $request->promoType() : (string) $promotion->type;
            $dates = $this->promotions->vigencyDates($request->input('starts_at'), $request->input('ends_at'));
            $start = $request->has('starts_at') ? $dates['starts_at'] : $promotion->starts_at;
            $end   = $request->has('ends_at') ? $dates['ends_at'] : $promotion->ends_at;
            $storeId = $request->has('store_id')
                ? $this->promotions->scopedStoreId($request)
                : ($promotion->store_id !== null ? (int) $promotion->store_id : null);
            $buyN = $request->has('buy_n') ? (int) $request->input('buy_n') : $promotion->buy_n;
            $payM = $request->has('pay_m') ? (int) $request->input('pay_m') : $promotion->pay_m;

            foreach ($assigned as $product) {
                $msg = $this->promotions->typeConflictMessage($product, $type, $start, $end, $storeId, $promotion->id)
                    ?? $this->promotions->duplicateMessage($product, $type, $buyN, $payM, $start, $end, $storeId, $promotion->id)
                    ?? $this->promotions->capMessage($product, $storeId, $promotion->id);
                if ($msg) {
                    return $this->error($msg, 422);
                }
            }
        }

        $promotion->update(array_merge(
            $request->only(['name', 'buy_n', 'pay_m', 'min_qty', 'discount_per_unit', 'allow_cash', 'allow_card', 'priority']),
            $this->promotions->vigencyDates($request->input('starts_at'), $request->input('ends_at')),
            $request->has('status') ? ['status' => $request->input('status')] : [],
            $request->has('store_id') ? ['store_id' => $this->promotions->scopedStoreId($request)] : [],
        ));

        return $this->success(
            $promotion->fresh()->loadCount('products')->load('products:products.id,name'),
            'Promoción actualizada.',
        );
    }

    /** DELETE /promotions/{promotion} — el pivote cae en cascada; los tickets
     *  históricos no se afectan (snapshot en sale_items sin FK). */
    public function destroy(ProductPromotion $promotion): JsonResponse
    {
        if ($resp = $this->adminOrManagerGateError()) {
            return $resp;
        }
        if ($resp = $this->promoManageError()) {
            return $resp;
        }
        if ($resp = $this->promoMutationGateError(request(), $promotion)) {
            return $resp;
        }

        $promotion->delete();

        return $this->success(null, 'Promoción eliminada.');
    }

    /** POST /promotions/{promotion}/products — asignación batch, TODO-o-NADA. */
    public function attachProducts(AssignPromotionProductsRequest $request, ProductPromotion $promotion): JsonResponse
    {
        if ($resp = $this->adminOrManagerGateError()) {
            return $resp;
        }
        if ($resp = $this->promoManageError()) {
            return $resp;
        }
        if ($resp = $this->promoMutationGateError($request, $promotion)) {
            return $resp;
        }

        $ids = array_values(array_unique(array_map('intval', $request->input('product_ids'))));
        $alreadyAssigned = $promotion->products()->pluck('products.id')->map(fn ($id) => (int) $id)->all();
        $newIds = array_values(array_diff($ids, $alreadyAssigned));

        // Todo-o-nada: se validan TODOS antes de asignar ninguno, y el 422
        // detalla qué producto falla y por qué (accionable para el admin).
        $errors = [];
        foreach (Product::query()->with('paymentMethod')->findMany($newIds) as $product) {
            if ($msg = $this->promotions->assignmentConflictMessage($promotion, $product)) {
                $errors[(string) $product->id] = [$msg];
            }
        }
        if ($errors) {
            return $this->error(
                'No se pudo asignar la promoción a ' . count($errors) . ' producto(s). Ningún producto fue asignado.',
                422,
                $errors,
            );
        }

        $promotion->products()->syncWithoutDetaching($newIds);

        return $this->success(
            $promotion->fresh()->loadCount('products')->load('products:products.id,name'),
            'Productos asignados.',
        );
    }

    /** DELETE /promotions/{promotion}/products/{product} — quitar UN producto. */
    public function detachProduct(ProductPromotion $promotion, Product $product): JsonResponse
    {
        if ($resp = $this->adminOrManagerGateError()) {
            return $resp;
        }
        if ($resp = $this->promoManageError()) {
            return $resp;
        }
        if ($resp = $this->promoMutationGateError(request(), $promotion)) {
            return $resp;
        }

        $promotion->products()->detach($product->id);

        // El puntero legacy DEBE anularse si apuntaba a este producto: una
        // revisión vieja de Cloud Run lee product_id directo y seguiría
        // aplicando la promo a un producto ya des-asignado.
        if ((int) $promotion->product_id === (int) $product->id) {
            $promotion->update(['product_id' => null]);
        }

        return $this->success(
            $promotion->fresh()->loadCount('products')->load('products:products.id,name'),
            'Producto quitado de la promoción.',
        );
    }

    /**
     * Un gerente solo muta promos de SU tienda; las globales o de otras
     * sucursales las gestiona el admin. (Espejo del shim anidado.)
     */
    private function promoMutationGateError(\Illuminate\Http\Request $request, ProductPromotion $promotion): ?JsonResponse
    {
        $user = $request->user();
        $isAdmin = $user && $user->hasRole(['admin', 'super_admin', 'owner', 'dueño']);
        if ($isAdmin) {
            return null;
        }
        if ($promotion->store_id !== null && (int) $promotion->store_id === (int) $user?->store_id) {
            return null;
        }

        return $this->error(
            'Solo puedes modificar promociones de tu tienda. Las globales o de otras sucursales las gestiona el admin.',
            403
        );
    }
}
