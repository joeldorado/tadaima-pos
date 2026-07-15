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

        $promotion = $product->promotions()->create(array_merge(
            $request->only(['name', 'buy_n', 'pay_m', 'priority']),
            $this->vigencyDates($request->input('starts_at'), $request->input('ends_at')),
            ['status' => $request->input('status', ProductPromotion::STATUS_ACTIVE)],
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

        $promotion->update(array_merge(
            $request->only(['name', 'buy_n', 'pay_m', 'priority']),
            $this->vigencyDates($request->input('starts_at'), $request->input('ends_at')),
            $request->has('status') ? ['status' => $request->input('status')] : [],
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

        $promotion->delete();

        return $this->success(null, 'Promoción eliminada.');
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
