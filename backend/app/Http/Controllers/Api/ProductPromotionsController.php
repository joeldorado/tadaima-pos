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
        if ($resp = $this->promoManageError()) {
            return $resp;
        }
        if ($request->input('status', ProductPromotion::STATUS_ACTIVE) === ProductPromotion::STATUS_ACTIVE) {
            if ($resp = $this->promoTypeConflictError($product, $request)) {
                return $resp;
            }
            if ($resp = $this->duplicatePromoError($product, $request)) {
                return $resp;
            }
            if ($resp = $this->activePromoCapError($product, $this->scopedStoreId($request))) {
                return $resp;
            }
        }

        $promotion = $product->promotions()->create(array_merge(
            $request->only(['name', 'buy_n', 'pay_m', 'min_qty', 'discount_per_unit', 'priority']),
            $this->vigencyDates($request->input('starts_at'), $request->input('ends_at')),
            [
                'type'     => $request->promoType(),
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
        if ($resp = $this->promoManageError()) {
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
            // Tipo EFECTIVO: `promoType()` cae a 'nxm' cuando el request no trae
            // `type`, y desde el mayoreo los PUT pueden ser parciales (pausar /
            // reanudar). Sin esto se compararía contra el tipo equivocado.
            $type = $request->has('type') ? $request->promoType() : (string) $promotion->type;

            if ($resp = $this->promoTypeConflictError($product, $request, $promotion->id, $type)) {
                return $resp;
            }
            if ($resp = $this->duplicatePromoError($product, $request, $promotion->id, $type)) {
                return $resp;
            }
            if ($resp = $this->activePromoCapError($product, $this->scopedStoreId($request), $promotion->id)) {
                return $resp;
            }
        }

        $promotion->update(array_merge(
            // `tiers` fuera (mayoreo 2026-07-23): los bundles viejos lo siguen
            // mandando al pausar y aquí se descarta en silencio.
            $request->only(['name', 'buy_n', 'pay_m', 'min_qty', 'discount_per_unit', 'priority']),
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
        if ($resp = $this->promoManageError()) {
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
     * todo). Tiendas: ámbito EXACTO desde el override local (2026-07-20) —
     * una local sobre la global es un REEMPLAZO deliberado y se permite.
     */
    private function duplicatePromoError(
        Product $product,
        StoreProductPromotionRequest $request,
        ?int $ignoreId = null,
        ?string $type = null,
    ): ?JsonResponse {
        $type  = $type ?? $request->promoType();
        $query = $this->overlappingActivePromos($product, $request, $ignoreId)
            ->where('type', $type);

        // NxM: duplicado = mismo N y M. Mayoreo: cualquier otra del mismo tipo
        // encimada es duplicado (competirían entre sí por la misma línea).
        if ($type === ProductPromotion::TYPE_NXM) {
            $query->where('buy_n', (int) $request->input('buy_n'))
                ->where('pay_m', (int) $request->input('pay_m'));
        }

        $existing = $query->first();
        if (! $existing) {
            return null;
        }

        $label = $type === ProductPromotion::TYPE_NXM
            ? "una promo {$request->input('buy_n')}x{$request->input('pay_m')}"
            : 'una promo de mayoreo';

        return $this->error(
            "Ya existe {$label} para este producto que se encima en fechas (\"{$existing->name}\"). Pausa o elimina esa, o usa un rango de fechas que no se encime.",
            422
        );
    }

    /**
     * Exclusividad de TIPOS (pedido Joel 2026-07-20): un producto no puede
     * tener a la vez una promo NxM y una de mayoreo vigentes con ventana y
     * ámbito de tienda encimados — una u otra.
     */
    private function promoTypeConflictError(
        Product $product,
        StoreProductPromotionRequest $request,
        ?int $ignoreId = null,
        ?string $type = null,
    ): ?JsonResponse {
        $type = $type ?? $request->promoType();

        $existing = $this->overlappingActivePromos($product, $request, $ignoreId)
            ->where('type', '!=', $type)
            ->first();

        if (! $existing) {
            return null;
        }

        $existingLabel = $existing->type === ProductPromotion::TYPE_NXM
            ? "{$existing->buy_n}x{$existing->pay_m}"
            : 'de mayoreo';

        return $this->error(
            "Este producto ya tiene la promo \"{$existing->name}\" ({$existingLabel}) vigente en esas fechas. No pueden convivir una NxM y una de mayoreo — pausa o elimina esa primero.",
            422
        );
    }

    /**
     * Query base compartida: promos ACTIVAS vivas del producto cuya VENTANA se
     * encima con lo que se está creando/reactivando, EN EL MISMO ÁMBITO EXACTO
     * de tienda. Ventana null = infinita (se encima con todo).
     *
     * ÁMBITO EXACTO (override local, Joel 2026-07-20): una LOCAL ya NO choca
     * con la GLOBAL — la local REEMPLAZA a la global en su tienda (el motor la
     * apaga ahí), así que crearla encima es deliberado y permitido. Local solo
     * choca con locales de SU tienda; global solo con globales.
     */
    private function overlappingActivePromos(
        Product $product,
        StoreProductPromotionRequest $request,
        ?int $ignoreId = null,
    ): \Illuminate\Database\Eloquent\Builder {
        $dates = $this->vigencyDates($request->input('starts_at'), $request->input('ends_at'));
        $newStart = $dates['starts_at'];
        $newEnd   = $dates['ends_at'];
        $storeId  = $this->scopedStoreId($request);

        return ProductPromotion::query()
            ->where('product_id', $product->id)
            ->where('status', ProductPromotion::STATUS_ACTIVE)
            ->when($ignoreId !== null, fn ($q) => $q->where('id', '!=', $ignoreId))
            // Solo vivas (no vencidas).
            ->where(fn ($q) => $q->whereNull('ends_at')->orWhere('ends_at', '>=', now()))
            // Mismo ámbito exacto de tienda (ver docblock).
            ->when($storeId === null, fn ($q) => $q->whereNull('store_id'))
            ->when($storeId !== null, fn ($q) => $q->where('store_id', $storeId))
            // Ventana que se encima (condición omitida si el lado nuevo es infinito).
            ->when($newEnd !== null, fn ($q) => $q->where(fn ($qq) =>
                $qq->whereNull('starts_at')->orWhere('starts_at', '<=', $newEnd)
            ))
            ->when($newStart !== null, fn ($q) => $q->where(fn ($qq) =>
                $qq->whereNull('ends_at')->orWhere('ends_at', '>=', $newStart)
            ));
    }

    /**
     * Tope de promos activas por producto EN EL MISMO ÁMBITO EXACTO de tienda
     * (override local 2026-07-20): máx 2 globales y máx 2 locales por sucursal.
     * La global "opacada" por una local ya no bloquea el tope de esa tienda.
     */
    private function activePromoCapError(Product $product, ?int $storeId, ?int $ignoreId = null): ?JsonResponse
    {
        $activeCount = ProductPromotion::query()
            ->where('product_id', $product->id)
            ->where('status', ProductPromotion::STATUS_ACTIVE)
            ->where(fn ($q) => $q->whereNull('ends_at')->orWhere('ends_at', '>=', now()))
            ->when($ignoreId !== null, fn ($q) => $q->where('id', '!=', $ignoreId))
            ->when($storeId === null, fn ($q) => $q->whereNull('store_id'))
            ->when($storeId !== null, fn ($q) => $q->where('store_id', $storeId))
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
