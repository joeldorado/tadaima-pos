<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreProductPromotionRequest;
use App\Models\Product;
use App\Models\ProductPromotion;
use App\Services\PromotionService;
use Illuminate\Http\JsonResponse;

/**
 * SHIM de compatibilidad (promos generales, 2026-07-25).
 *
 * Este era el CRUD real cuando las promos vivían bajo un producto. Hoy la
 * entidad es general (PromotionsController + PromotionService) y estos
 * endpoints anidados quedan vivos porque hay bundles PWA rezagados cacheados
 * por service worker que los siguen llamando:
 *
 *   GET    → promos ASIGNADAS al producto (vía pivote)
 *   POST   → crea promo general + la asigna a este producto (y escribe el
 *            product_id legacy para que una revisión vieja la siga viendo)
 *   PUT    → edita la promo general (delegado al controller top-level)
 *   DELETE → des-asigna de este producto; si queda sin productos, la borra
 *            (preserva la semántica vieja sin destruir una multi-asignada)
 */
class ProductPromotionsController extends Controller
{
    public function __construct(private readonly PromotionService $promotions)
    {
    }

    /** GET /products/{product}/promotions — asignadas (el admin ve pausadas/vencidas). */
    public function index(Product $product): JsonResponse
    {
        // Honestidad lazy sobre las asignadas a ESTE producto.
        ProductPromotion::query()
            ->whereHas('products', fn ($q) => $q->where('products.id', $product->id))
            ->where('status', ProductPromotion::STATUS_ACTIVE)
            ->whereNotNull('ends_at')
            ->where('ends_at', '<', now())
            ->update(['status' => ProductPromotion::STATUS_EXPIRED]);

        // El bundle viejo espera `product_id` = el producto de la ruta; una
        // promo general asignada puede traerlo null o de otro producto.
        $promos = $product->promotions()
            ->orderByDesc('priority')
            ->orderBy('product_promotions.id')
            ->get()
            ->map(fn (ProductPromotion $p) => tap($p)->setAttribute('product_id', (int) $product->id));

        return $this->success($promos);
    }

    /** POST /products/{product}/promotions — crear + asignar a este producto. */
    public function store(StoreProductPromotionRequest $request, Product $product): JsonResponse
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
        if ($msg = $this->promotions->paymentConflictMessage(
            $product,
            $request->has('allow_cash') ? $request->boolean('allow_cash') : true,
            $request->has('allow_card') ? $request->boolean('allow_card') : true,
        )) {
            return $this->error($msg, 422);
        }

        $dates   = $this->promotions->vigencyDates($request->input('starts_at'), $request->input('ends_at'));
        $storeId = $this->promotions->scopedStoreId($request);

        if ($request->input('status', ProductPromotion::STATUS_ACTIVE) === ProductPromotion::STATUS_ACTIVE) {
            $type = $request->promoType();
            $msg = $this->promotions->typeConflictMessage($product, $type, $dates['starts_at'], $dates['ends_at'], $storeId)
                ?? $this->promotions->duplicateMessage(
                    $product,
                    $type,
                    $request->input('buy_n') !== null ? (int) $request->input('buy_n') : null,
                    $request->input('pay_m') !== null ? (int) $request->input('pay_m') : null,
                    $dates['starts_at'],
                    $dates['ends_at'],
                    $storeId,
                )
                ?? $this->promotions->capMessage($product, $storeId);
            if ($msg) {
                return $this->error($msg, 422);
            }
        }

        // `product_id` legacy A PROPÓSITO: el hook created() del modelo lo
        // asigna al pivote, y una revisión vieja (rollout) lo sigue viendo.
        $promotion = ProductPromotion::create(array_merge(
            $request->only(['name', 'buy_n', 'pay_m', 'min_qty', 'discount_per_unit', 'allow_cash', 'allow_card', 'priority']),
            $dates,
            [
                'type'       => $request->promoType(),
                'status'     => $request->input('status', ProductPromotion::STATUS_ACTIVE),
                'store_id'   => $storeId,
                'product_id' => $product->id,
            ],
        ));

        return $this->success($promotion, 'Promoción creada.', 201);
    }

    /** PUT /products/{product}/promotions/{promotion} — editar / pausar / reanudar. */
    public function update(StoreProductPromotionRequest $request, Product $product, ProductPromotion $promotion): JsonResponse
    {
        // Mismo orden de gates que el controller viejo (rol → permiso → 404);
        // el delegado los repite, lo cual es inofensivo.
        if ($resp = $this->adminOrManagerGateError()) {
            return $resp;
        }
        if ($resp = $this->promoManageError()) {
            return $resp;
        }
        if ($resp = $this->assignmentMissingError($product, $promotion)) {
            return $resp;
        }

        // Una sola implementación: el update real vive en el controller
        // top-level (valida contra TODOS los productos asignados — para las
        // shim-creadas hay uno solo, así que el comportamiento es idéntico).
        return app(PromotionsController::class)->update($request, $promotion);
    }

    /** DELETE /products/{product}/promotions/{promotion} — des-asignar o borrar. */
    public function destroy(Product $product, ProductPromotion $promotion): JsonResponse
    {
        if ($resp = $this->adminOrManagerGateError()) {
            return $resp;
        }
        if ($resp = $this->promoManageError()) {
            return $resp;
        }
        if ($resp = $this->assignmentMissingError($product, $promotion)) {
            return $resp;
        }
        if ($resp = $this->promoMutationGateError($promotion)) {
            return $resp;
        }

        $promotion->products()->detach($product->id);
        if ((int) $promotion->product_id === (int) $product->id) {
            // Sin esto una revisión vieja seguiría aplicando la promo aquí.
            $promotion->update(['product_id' => null]);
        }

        // Semántica vieja preservada: si ya no aplica a NINGÚN producto, la
        // promo desaparece — pero una multi-asignada sobrevive para los demás.
        if ($promotion->products()->count() === 0) {
            $promotion->delete();
        }

        return $this->success(null, 'Promoción eliminada.');
    }

    /** 404 si la promo no está asignada a este producto (antes: product_id !=). */
    private function assignmentMissingError(Product $product, ProductPromotion $promotion): ?JsonResponse
    {
        $assigned = $promotion->products()->where('products.id', $product->id)->exists();

        return $assigned ? null : $this->error('La promoción no pertenece a este producto.', 404);
    }

    /** Gerente solo muta promos de su tienda (espejo del top-level). */
    private function promoMutationGateError(ProductPromotion $promotion): ?JsonResponse
    {
        $user = request()->user();
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
