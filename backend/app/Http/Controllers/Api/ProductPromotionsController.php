<?php

declare(strict_types=1);

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\StoreProductPromotionRequest;
use App\Models\Product;
use App\Models\ProductPromotion;
use App\Support\DateRange;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;

/**
 * Promociones NxM por producto (Fase 3). Viven en el editor de producto
 * (4ª tab "Promociones"); el motor de caja solo consume las VIGENTES vía
 * `active_promotions` en el payload de productos.
 *
 * RBAC: mutaciones gated a admin/gerente (mismo gate que editar catálogo de
 * productos). Cualquier usuario autenticado puede listar (Caja las necesita).
 */
class ProductPromotionsController extends Controller
{
    /** GET /products/{product}/promotions — todas (el admin ve pausadas/vencidas). */
    public function index(Product $product): JsonResponse
    {
        // Honestidad lazy: marca expired las que ya pasaron su ventana para que
        // el admin vea el estado real (el motor de caja NO depende de esto —
        // currentlyActive() filtra por ventana en SQL).
        ProductPromotion::query()
            ->where('product_id', $product->id)
            ->where('status', ProductPromotion::STATUS_ACTIVE)
            ->whereNotNull('ends_at')
            ->where('ends_at', '<', now())
            ->update(['status' => ProductPromotion::STATUS_EXPIRED]);

        return $this->success(
            $product->promotions()->orderByDesc('priority')->orderBy('id')->get()
        );
    }

    /** POST /products/{product}/promotions */
    public function store(StoreProductPromotionRequest $request, Product $product): JsonResponse
    {
        if ($resp = $this->adminOrManagerGateError()) {
            return $resp;
        }
        if ($request->input('status', ProductPromotion::STATUS_ACTIVE) === ProductPromotion::STATUS_ACTIVE) {
            if ($resp = $this->duplicatePromoError($product, $request)) {
                return $resp;
            }
            if ($resp = $this->activePromoCapError($product, $this->scopedStoreId($request))) {
                return $resp;
            }
        }

        $promotion = $product->promotions()->create(array_merge(
            $request->only(['name', 'buy_n', 'pay_m', 'priority']),
            $this->vigencyDates($request->input('starts_at'), $request->input('ends_at')),
            [
                'status'   => $request->input('status', ProductPromotion::STATUS_ACTIVE),
                'store_id' => $this->scopedStoreId($request),
            ],
        ));

        return $this->success($promotion, 'Promoción creada.', 201);
    }

    /** PUT /products/{product}/promotions/{promotion} — editar / pausar / reanudar. */
    public function update(StoreProductPromotionRequest $request, Product $product, ProductPromotion $promotion): JsonResponse
    {
        if ($resp = $this->adminOrManagerGateError()) {
            return $resp;
        }
        if ((int) $promotion->product_id !== (int) $product->id) {
            return $this->error('La promoción no pertenece a este producto.', 404);
        }
        if ($resp = $this->promoMutationGateError($request, $promotion)) {
            return $resp;
        }
        // Duplicado y tope solo al REACTIVAR (pausada/vencida → activa); editar
        // una que ya está activa no se bloquea aunque exista un excedente legacy.
        if ($request->has('status')
            && $request->input('status') === ProductPromotion::STATUS_ACTIVE
            && $promotion->status !== ProductPromotion::STATUS_ACTIVE) {
            if ($resp = $this->duplicatePromoError($product, $request, $promotion->id)) {
                return $resp;
            }
            if ($resp = $this->activePromoCapError($product, $this->scopedStoreId($request), $promotion->id)) {
                return $resp;
            }
        }

        $promotion->update(array_merge(
            $request->only(['name', 'buy_n', 'pay_m', 'priority']),
            $this->vigencyDates($request->input('starts_at'), $request->input('ends_at')),
            $request->has('status') ? ['status' => $request->input('status')] : [],
            $request->has('store_id') ? ['store_id' => $this->scopedStoreId($request)] : [],
        ));

        return $this->success($promotion->fresh(), 'Promoción actualizada.');
    }

    /** DELETE /products/{product}/promotions/{promotion} — el ticket histórico
     *  no se afecta: sale_items guarda snapshot (promo_name/promo_free_qty). */
    public function destroy(Product $product, ProductPromotion $promotion): JsonResponse
    {
        if ($resp = $this->adminOrManagerGateError()) {
            return $resp;
        }
        if ((int) $promotion->product_id !== (int) $product->id) {
            return $this->error('La promoción no pertenece a este producto.', 404);
        }
        if ($resp = $this->promoMutationGateError(request(), $promotion)) {
            return $resp;
        }

        $promotion->delete();

        return $this->success(null, 'Promoción eliminada.');
    }

    /** Máximo de promos ACTIVAS a la vez por producto (pedido Joel 2026-07-18). */
    private const MAX_ACTIVE_PROMOS = 2;

    /**
     * Anti-duplicados (pedido Joel 2026-07-18): otra promo con el MISMO NxM se
     * permite SOLO si su vigencia NO se encima con una activa existente (2x1 de
     * julio + 2x1 de diciembre = OK). Ventana null = infinita (se encima con
     * todo). Tiendas: global (NULL) se encima con cualquiera; tiendas distintas
     * no chocan entre sí.
     */
    private function duplicatePromoError(
        Product $product,
        \Illuminate\Http\Request $request,
        ?int $ignoreId = null,
    ): ?JsonResponse {
        $buyN = (int) $request->input('buy_n');
        $payM = (int) $request->input('pay_m');
        $dates = $this->vigencyDates($request->input('starts_at'), $request->input('ends_at'));
        $newStart = $dates['starts_at'];
        $newEnd   = $dates['ends_at'];
        $storeId  = $this->scopedStoreId($request);

        $existing = ProductPromotion::query()
            ->where('product_id', $product->id)
            ->where('status', ProductPromotion::STATUS_ACTIVE)
            ->where('buy_n', $buyN)
            ->where('pay_m', $payM)
            ->when($ignoreId !== null, fn ($q) => $q->where('id', '!=', $ignoreId))
            // Solo vivas (no vencidas).
            ->where(fn ($q) => $q->whereNull('ends_at')->orWhere('ends_at', '>=', now()))
            // Tienda que se encima; nueva global (NULL) choca con todas.
            ->when($storeId !== null, fn ($q) => $q->where(fn ($qq) =>
                $qq->whereNull('store_id')->orWhere('store_id', $storeId)
            ))
            // Ventana que se encima (condición omitida si el lado nuevo es infinito).
            ->when($newEnd !== null, fn ($q) => $q->where(fn ($qq) =>
                $qq->whereNull('starts_at')->orWhere('starts_at', '<=', $newEnd)
            ))
            ->when($newStart !== null, fn ($q) => $q->where(fn ($qq) =>
                $qq->whereNull('ends_at')->orWhere('ends_at', '>=', $newStart)
            ))
            ->first();

        if (! $existing) {
            return null;
        }

        return $this->error(
            "Ya existe una promo {$buyN}x{$payM} para este producto que se encima en fechas (\"{$existing->name}\"). Pausa o elimina esa, o usa un rango de fechas que no se encime.",
            422
        );
    }

    /**
     * Tope de promos activas por producto EN EL MISMO ÁMBITO de tienda: la caja
     * soporta varias (gana la que más ahorra), pero más de 2 activas confunde al
     * equipo — se pausa/elimina una antes de activar otra. Las globales (NULL)
     * cuentan para todas las tiendas; cada sucursal tiene su propio tope.
     */
    private function activePromoCapError(Product $product, ?int $storeId, ?int $ignoreId = null): ?JsonResponse
    {
        $activeCount = ProductPromotion::query()
            ->where('product_id', $product->id)
            ->where('status', ProductPromotion::STATUS_ACTIVE)
            ->where(fn ($q) => $q->whereNull('ends_at')->orWhere('ends_at', '>=', now()))
            ->when($ignoreId !== null, fn ($q) => $q->where('id', '!=', $ignoreId))
            ->when($storeId !== null, fn ($q) => $q->where(fn ($qq) =>
                $qq->whereNull('store_id')->orWhere('store_id', $storeId)
            ))
            ->count();

        if ($activeCount < self::MAX_ACTIVE_PROMOS) {
            return null;
        }

        return $this->error(
            'Este producto ya tiene 2 promociones activas — pausa o elimina una antes de activar otra.',
            422
        );
    }

    /**
     * Un gerente solo puede EDITAR/PAUSAR/BORRAR promos de SU tienda. Las
     * globales (store_id null) y las de otras tiendas son solo-lectura para él
     * (se listan para que no las duplique en el mismo producto). Admin: todo.
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

    /**
     * Fechas de vigencia en la ZONA DEL NEGOCIO (America/Tijuana) → UTC.
     *
     * El admin manda 'YYYY-MM-DD' plano: starts_at = inicio del día local,
     * ends_at = fin del día local (23:59:59 Tijuana). Sin esta conversión una
     * promo "vence el 20" moría a las ~5pm locales (23:59 UTC) — misma clase
     * de bug que DateRange ya resolvió en cortes (TODO #117).
     * Un ISO con hora (round-trip de update) se parsea tal cual (ya es UTC).
     *
     * @return array{starts_at: ?\Carbon\Carbon, ends_at: ?\Carbon\Carbon}
     */
    /**
     * Tienda de la promo con RBAC: admin manda lo que quiera (null = todas las
     * tiendas); gerente queda FORZADO a su propia tienda — no puede crear promos
     * globales ni de otras sucursales.
     */
    private function scopedStoreId(\Illuminate\Http\Request $request): ?int
    {
        $user = $request->user();
        $isAdmin = $user && $user->hasRole(['admin', 'super_admin', 'owner', 'dueño']);
        if ($isAdmin) {
            return $request->filled('store_id') ? (int) $request->input('store_id') : null;
        }

        return $user?->store_id ? (int) $user->store_id : null;
    }

    private function vigencyDates(?string $startsAt, ?string $endsAt): array
    {
        $parse = static function (?string $value, bool $endOfDay): ?Carbon {
            if (! $value) {
                return null;
            }
            if (preg_match('/^\d{4}-\d{2}-\d{2}$/', $value)) {
                return $endOfDay ? DateRange::toUtc($value) : DateRange::fromUtc($value);
            }
            try {
                return Carbon::parse($value)->utc();
            } catch (\Throwable) {
                return null;
            }
        };

        return [
            'starts_at' => $parse($startsAt, false),
            'ends_at'   => $parse($endsAt, true),
        ];
    }
}
